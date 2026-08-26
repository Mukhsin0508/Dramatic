"use client";

import { useEffect, useState } from "react";

import styles from "@/app/page.module.css";

type Stats = { stars: number | null; forks: number | null };

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

// The landing page is statically exported, so counts baked in at build time
// go stale immediately. Refresh them in the browser straight from GitHub.
function useLiveRepoStats(apiUrl: string, initial: Stats): Stats {
  const [stats, setStats] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl, { headers: { Accept: "application/vnd.github+json" } })
      .then(response => (response.ok ? response.json() : null))
      .then((data: { stargazers_count?: number; forks_count?: number } | null) => {
        if (cancelled || !data) return;
        setStats({
          stars: typeof data.stargazers_count === "number" ? data.stargazers_count : null,
          forks: typeof data.forks_count === "number" ? data.forks_count : null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return stats;
}

export function NavGitHubLink({ href, apiUrl, initialStars, initialForks }: {
  href: string;
  apiUrl: string;
  initialStars: number | null;
  initialForks: number | null;
}) {
  const { stars } = useLiveRepoStats(apiUrl, { stars: initialStars, forks: initialForks });
  return (
    <a
      className={styles.navLink}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={stars === null ? "View Dramatic on GitHub" : `View Dramatic on GitHub, ${stars} stars`}
    >
      {stars === null ? null : <><span aria-hidden="true">★</span> {formatCount(stars)}</>}
      <span className={styles.navRepoLabel}>GitHub</span> <span aria-hidden="true">↗</span>
    </a>
  );
}

export function RepoCardStats({ apiUrl, initialStars, initialForks }: {
  apiUrl: string;
  initialStars: number | null;
  initialForks: number | null;
}) {
  const { stars, forks } = useLiveRepoStats(apiUrl, { stars: initialStars, forks: initialForks });
  return (
    <div className={styles.repoStats}>
      <span><b>★</b><strong>{stars === null ? "—" : formatCount(stars)}</strong><small>{stars === null ? "unavailable" : "stars"}</small></span>
      <span><b>⑂</b><strong>{forks === null ? "—" : formatCount(forks)}</strong><small>{forks === null ? "unavailable" : "forks"}</small></span>
    </div>
  );
}
