import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { AbortedError, ProtocolError } from "./errors.js";

export interface ResolvedHostAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export interface HostResolver {
  resolve(hostname: string, signal?: AbortSignal): Promise<readonly ResolvedHostAddress[]>;
}

export interface ResolvedDownloadTarget {
  readonly url: URL;
  /** Every DNS answer is validated; transports pin one of these addresses. */
  readonly addresses: readonly ResolvedHostAddress[];
}

/** Node's system resolver, injectable so URL-policy tests never depend on live DNS. */
export class NodeHostResolver implements HostResolver {
  async resolve(hostname: string, signal?: AbortSignal): Promise<readonly ResolvedHostAddress[]> {
    if (signal?.aborted) throw new AbortedError(signal.reason);
    const resolution = lookup(hostname, { all: true, order: "verbatim" }).then((answers) =>
      answers.map((answer): ResolvedHostAddress => ({
        address: answer.address,
        family: answer.family === 6 ? 6 : 4,
      })),
    );
    if (!signal) return resolution;
    return new Promise((resolve, reject) => {
      const onAbort = (): void => reject(new AbortedError(signal.reason));
      signal.addEventListener("abort", onAbort, { once: true });
      void resolution.then(
        (answers) => {
          signal.removeEventListener("abort", onAbort);
          resolve(answers);
        },
        (cause: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(cause);
        },
      );
    });
  }
}

export function assertTrustedControlUrl(value: string, trustedOrigins: ReadonlySet<string>): URL {
  const url = parseUrl(value, "control");
  if (!trustedOrigins.has(url.origin)) {
    throw new ProtocolError(`Provider returned an untrusted control URL origin: ${url.origin}`);
  }
  return url;
}

/** Syntax/literal validation. Network callers must also use resolveSafeDownloadTarget. */
export function assertSafeDownloadUrl(value: string): URL {
  const url = parseUrl(value, "artifact");
  if (url.protocol !== "https:") {
    throw new ProtocolError("Artifact URLs must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new ProtocolError("Artifact URLs must not contain credentials.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw disallowedHost();
  }
  const family = isIP(hostname);
  if (family !== 0 && !isPublicIpAddress(hostname)) throw disallowedHost();
  return url;
}

/**
 * Resolves and validates every address for a download host. Callers must connect
 * to one returned address without resolving the hostname a second time.
 */
export async function resolveSafeDownloadTarget(
  value: string,
  resolver: HostResolver,
  signal?: AbortSignal,
): Promise<ResolvedDownloadTarget> {
  const url = assertSafeDownloadUrl(value);
  const hostname = normalizeHostname(url.hostname);
  const literalFamily = isIP(hostname);
  const resolved = literalFamily === 0
    ? await resolveHost(resolver, hostname, signal)
    : [{ address: hostname, family: literalFamily as 4 | 6 }];
  if (resolved.length === 0) throw new ProtocolError("Artifact host did not resolve to an address.");

  const addresses: ResolvedHostAddress[] = [];
  const seen = new Set<string>();
  for (const answer of resolved) {
    const family = isIP(answer.address);
    if (family === 0 || family !== answer.family || !isPublicIpAddress(answer.address)) throw disallowedHost();
    const key = `${family}:${answer.address.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      addresses.push({ address: answer.address, family: family as 4 | 6 });
    }
  }
  return { url, addresses };
}

function parseUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ProtocolError(`Provider returned an invalid ${label} URL.`, { cause });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProtocolError(`Provider returned an unsupported ${label} URL protocol.`);
  }
  return url;
}

async function resolveHost(resolver: HostResolver, hostname: string, signal?: AbortSignal): Promise<readonly ResolvedHostAddress[]> {
  try {
    return await resolver.resolve(hostname, signal);
  } catch (cause) {
    if (cause instanceof AbortedError) throw cause;
    throw new ProtocolError("Artifact host could not be resolved safely.", { cause });
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
}

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const value = (((octets[0] ?? 0) * 0x1000000) + ((octets[1] ?? 0) << 16) + ((octets[2] ?? 0) << 8) + (octets[3] ?? 0)) >>> 0;
  return !IPV4_DENYLIST.some(([network, bits]) => inIpv4Subnet(value, network, bits));
}

const IPV4_DENYLIST: readonly (readonly [number, number])[] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];

function inIpv4Subnet(value: number, network: number, bits: number): boolean {
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (network & mask);
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;
  // Reject mapped IPv4 instead of relying on platform-dependent socket normalization.
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) return false;
  // Global unicast is 2000::/3; exclude special-use ranges within that block.
  if ((bytes[0]! & 0xe0) !== 0x20) return false;
  if (hasIpv6Prefix(bytes, [0x20, 0x01], 23)) return false;
  if (hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false;
  if (hasIpv6Prefix(bytes, [0x20, 0x02], 16)) return false;
  if (hasIpv6Prefix(bytes, [0x3f, 0xff, 0x00], 20)) return false;
  return true;
}

function ipv6Bytes(address: string): Uint8Array | undefined {
  if (address.includes("%")) return undefined;
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return undefined;
  const left = parseIpv6Groups(halves[0] ?? "");
  const right = parseIpv6Groups(halves[1] ?? "");
  if (!left || !right) return undefined;
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return undefined;
  const groups = [...left, ...Array.from({ length: omitted }, () => 0), ...right];
  if (groups.length !== 8) return undefined;
  const output = new Uint8Array(16);
  groups.forEach((group, index) => {
    output[index * 2] = group >> 8;
    output[index * 2 + 1] = group & 0xff;
  });
  return output;
}

function parseIpv6Groups(input: string): number[] | undefined {
  if (!input) return [];
  const groups = input.split(":");
  const output: number[] = [];
  for (const group of groups) {
    if (group.includes(".")) {
      if (group !== groups.at(-1)) return undefined;
      const octets = group.split(".").map(Number);
      if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
      output.push(((octets[0] ?? 0) << 8) | (octets[1] ?? 0), ((octets[2] ?? 0) << 8) | (octets[3] ?? 0));
    } else {
      if (!/^[0-9a-f]{1,4}$/u.test(group)) return undefined;
      output.push(Number.parseInt(group, 16));
    }
  }
  return output;
}

function hasIpv6Prefix(bytes: Uint8Array, prefix: readonly number[], bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remaining = bits % 8;
  if (remaining === 0) return true;
  const mask = (0xff << (8 - remaining)) & 0xff;
  return (bytes[fullBytes]! & mask) === ((prefix[fullBytes] ?? 0) & mask);
}

function disallowedHost(): ProtocolError {
  return new ProtocolError("Artifact URL resolves to a disallowed local, private, or special-use host.");
}
