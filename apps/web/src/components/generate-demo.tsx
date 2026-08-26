"use client";

import { useRef, useState } from "react";

import styles from "@/app/page.module.css";

const STORIES = [
  { slug: "opening-night", title: "Opening Night" },
  { slug: "two-rings-at-the-funeral", title: "Two Rings at the Funeral" },
] as const;

const TWISTS = ["As scripted", "Rain-soaked", "First light", "Neon night", "Rolling fog"] as const;

const WAIT_COPY = [
  "Estimating the cost…",
  "Submitting to the studio…",
  "Blocking the shot…",
  "Lighting the set…",
  "Rendering frames — up to a couple of minutes…",
  "Still rendering — cinematic patience…",
];

type Result = { imageUrl: string; usd: number; story: string };

export function GenerateDemo() {
  const [slug, setSlug] = useState<string>(STORIES[0].slug);
  const [twist, setTwist] = useState(0);
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [waitMessage, setWaitMessage] = useState(WAIT_COPY[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = async () => {
    if (phase === "working") return;
    setPhase("working");
    setResult(null);
    let step = 0;
    setWaitMessage(WAIT_COPY[0]);
    ticker.current = setInterval(() => {
      step = Math.min(step + 1, WAIT_COPY.length - 1);
      setWaitMessage(WAIT_COPY[step]);
    }, 18_000);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const response = await fetch("/api/demo/poster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, twist }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.imageUrl) {
        setErrorMessage(payload?.message ?? "The studio isn’t answering right now.");
        setPhase("error");
        return;
      }
      setResult(payload as Result);
      setPhase("done");
    } catch {
      setErrorMessage("The connection dropped while rendering. The scene may still finish server-side.");
      setPhase("error");
    } finally {
      if (ticker.current) clearInterval(ticker.current);
    }
  };

  return (
    <div className={styles.forgePanel}>
      <div className={styles.forgeControls}>
        <span className={styles.forgeLabel}>Story</span>
        <div className={styles.forgeChips} role="radiogroup" aria-label="Story to generate for">
          {STORIES.map(story => (
            <button
              key={story.slug}
              type="button"
              role="radio"
              aria-checked={slug === story.slug}
              className={slug === story.slug ? styles.forgeChipActive : styles.forgeChip}
              onClick={() => setSlug(story.slug)}
            >
              {story.title}
            </button>
          ))}
        </div>
        <span className={styles.forgeLabel}>Twist</span>
        <div className={styles.forgeChips} role="radiogroup" aria-label="Visual twist">
          {TWISTS.map((label, index) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={twist === index}
              className={twist === index ? styles.forgeChipActive : styles.forgeChip}
              onClick={() => setTwist(index)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.forgeButton}
          onClick={generate}
          disabled={phase === "working"}
        >
          {phase === "working" ? waitMessage : "Forge this scene"}
        </button>
        <p className={styles.forgeFinePrint}>
          Real generation, shared budget: one scene at a time, a few per visitor,
          hard-capped per request and per day.
        </p>
      </div>
      <div className={styles.forgeStage} aria-live="polite">
        {phase === "done" && result ? (
          <>
            {/* Provider-hosted result; next/image is unavailable for dynamic remote hosts in a static export. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.forgeImage} src={result.imageUrl} alt={`Freshly generated key art for ${result.story}`} />
            <span className={styles.forgeReceipt}>fresh from the studio · ${result.usd.toFixed(2)}</span>
          </>
        ) : (
          <div className={styles.forgeEmpty}>
            {phase === "working" ? (
              <span className={styles.forgePulse} aria-hidden="true" />
            ) : null}
            <p>
              {phase === "working"
                ? waitMessage
                : phase === "error"
                  ? errorMessage
                  : "Your scene appears here — 720p, 9:16, straight from the model."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
