import { describe, expect, it } from "vitest";

import { ConfigurationError, loadHiggsfieldConfig } from "../src/index.js";

describe("Higgsfield configuration", () => {
  it("requires a documented KEY_ID:KEY_SECRET credential", () => {
    expect(() => loadHiggsfieldConfig({})).toThrow(ConfigurationError);
    expect(() => loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: "secret-only" })).toThrow(
      /KEY_ID:KEY_SECRET/u,
    );
    expect(() => loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: ":secret" })).toThrow();
    expect(() => loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: "key:" })).toThrow();
    expect(() => loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: "key:\nsecret" })).toThrow(
      /control/u,
    );
  });

  it("supports the official HF_CREDENTIALS alias and redacts secrets", () => {
    const config = loadHiggsfieldConfig({ HF_CREDENTIALS: "public-id:private-secret" });
    expect(config.credentials.authorizationHeader()).toBe("Key public-id:private-secret");
    expect(String(config.credentials)).toBe("[REDACTED]");
    expect(JSON.stringify(config.credentials)).toBe('"[REDACTED]"');
    expect(config.baseUrl.href).toBe("https://platform.higgsfield.ai/");
    expect(config.userAgent).toBe("dramatic-higgsfield/0.1");
  });

  it("rejects conflicting aliases and insecure remote base URLs", () => {
    expect(() =>
      loadHiggsfieldConfig({ HIGGSFIELD_API_KEY: "a:b", HF_CREDENTIALS: "c:d" }),
    ).toThrow(/disagree/u);
    expect(() =>
      loadHiggsfieldConfig(
        { HIGGSFIELD_API_KEY: "a:b" },
        { baseUrl: new URL("http://example.com") },
      ),
    ).toThrow(/HTTPS/u);
    expect(() =>
      loadHiggsfieldConfig(
        { HIGGSFIELD_API_KEY: "a:b" },
        { userAgent: "bad\nagent" },
      ),
    ).toThrow(/user agent/u);
  });

  it("selects dev or production API origins from either documented base alias", () => {
    for (const variable of ["HF_API_BASE", "HIGGSFIELD_API_BASE_URL"] as const) {
      const config = loadHiggsfieldConfig({
        HIGGSFIELD_API_KEY: "key:secret",
        [variable]: "https://dev-api.higgsfield.com",
      });
      expect(config.baseUrl.href).toBe("https://dev-api.higgsfield.com/");
      expect(config.trustedControlOrigins).toEqual(
        new Set(["https://dev-api.higgsfield.com"]),
      );
      expect(config.trustedControlOrigins.has("https://platform.higgsfield.ai")).toBe(false);
    }
  });

  it("rejects conflicting base aliases but lets an explicit override take precedence", () => {
    const conflictingEnv = {
      HIGGSFIELD_API_KEY: "key:secret",
      HF_API_BASE: "https://dev-api.higgsfield.com",
      HIGGSFIELD_API_BASE_URL: "https://platform.higgsfield.ai",
    };
    expect(() => loadHiggsfieldConfig(conflictingEnv)).toThrow(/base.*disagree/iu);

    const overridden = loadHiggsfieldConfig(conflictingEnv, {
      baseUrl: new URL("http://127.0.0.1:4312"),
    });
    expect(overridden.baseUrl.href).toBe("http://127.0.0.1:4312/");
    expect(overridden.trustedControlOrigins).toEqual(new Set(["http://127.0.0.1:4312"]));
  });

  it("normalizes equivalent base aliases and rejects ambiguous base URL shapes", () => {
    expect(loadHiggsfieldConfig({
      HIGGSFIELD_API_KEY: "key:secret",
      HF_API_BASE: "https://dev-api.higgsfield.com",
      HIGGSFIELD_API_BASE_URL: "https://dev-api.higgsfield.com/",
    }).baseUrl.href).toBe("https://dev-api.higgsfield.com/");

    for (const value of [
      "not-a-url",
      "https://key:secret@dev-api.higgsfield.com",
      "https://dev-api.higgsfield.com/v1",
      "https://dev-api.higgsfield.com/?environment=dev",
      "https://dev-api.higgsfield.com/#dev",
      "https://example.com",
    ]) {
      expect(() => loadHiggsfieldConfig({
        HIGGSFIELD_API_KEY: "key:secret",
        HF_API_BASE: value,
      })).toThrow(ConfigurationError);
    }
  });

  it("supports a configurable header-safe User-Agent", () => {
    expect(loadHiggsfieldConfig({
      HIGGSFIELD_API_KEY: "key:secret",
      HIGGSFIELD_USER_AGENT: "dramatic-worker/2026.8",
    }).userAgent).toBe("dramatic-worker/2026.8");
    expect(loadHiggsfieldConfig(
      { HIGGSFIELD_API_KEY: "key:secret", HIGGSFIELD_USER_AGENT: "ignored/1" },
      { userAgent: "dramatic-test/1" },
    ).userAgent).toBe("dramatic-test/1");

    for (const value of ["", " bad/1", "bad/1 ", "bad\nagent", "drámatic/1", "x".repeat(129)]) {
      expect(() => loadHiggsfieldConfig({
        HIGGSFIELD_API_KEY: "key:secret",
        HIGGSFIELD_USER_AGENT: value,
      })).toThrow(/user agent/u);
    }
  });
});
