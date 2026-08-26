import Image from "next/image";
import { LANDING_STORIES as stories } from "@/data/stories.generated";
import styles from "./page.module.css";

export const revalidate = 3600;

const githubRepository = resolveGitHubRepository(
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY_URL,
);
const githubUrl = githubRepository.webUrl;

const steps = [
  {
    number: "01",
    title: "Watch the cliffhanger",
    body: "One sharp episode. Ninety seconds. Just enough time to make a bad decision feel reasonable.",
  },
  {
    number: "02",
    title: "Make the call",
    body: "Tell her to confess. Make him walk away. Your vote joins everyone watching tonight.",
  },
  {
    number: "03",
    title: "Come back tomorrow",
    body: "The winning choice becomes the next episode—written, produced, and ready for the next twist.",
  },
] as const;

type GitHubRepo = {
  stargazers_count?: number;
  forks_count?: number;
};

async function getRepoStats() {
  try {
    const response = await fetch(
      githubRepository.apiUrl,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "dramatic-landing-page",
        },
        next: { revalidate: 3600 },
      },
    );

    if (!response.ok) return { stars: null, forks: null };
    const data = (await response.json()) as GitHubRepo;
    return {
      stars: data.stargazers_count ?? null,
      forks: data.forks_count ?? null,
    };
  } catch {
    return { stars: null, forks: null };
  }
}

function resolveGitHubRepository(value?: string) {
  const fallback = "https://github.com/Mukhsin0508/Dramatic";
  try {
    const url = new URL(value ?? fallback);
    const [owner, repository, ...rest] = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || !owner || !repository || rest.length > 0) {
      throw new Error("Invalid GitHub repository URL");
    }
    return {
      webUrl: `https://github.com/${owner}/${repository}`,
      apiUrl: `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    };
  } catch {
    return {
      webUrl: fallback,
      apiUrl: "https://api.github.com/repos/Mukhsin0508/Dramatic",
    };
  }
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

function SparkMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <Image src="/brand-mark.png" alt="" width={34} height={34} />
    </span>
  );
}

function Brand() {
  return (
    <a className={styles.brand} href="#top" aria-label="Dramatic home">
      <SparkMark />
      <span>dramatic</span>
    </a>
  );
}

export default async function Home() {
  const repo = await getRepoStats();

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Primary navigation">
        <Brand />
        <div className={styles.navItems}>
          <a href="#stories">Stories</a>
          <a href="#how">How it works</a>
          <a
            className={styles.navLink}
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={repo.stars === null ? "View Dramatic on GitHub" : `View Dramatic on GitHub, ${repo.stars} stars`}
          >
            {repo.stars === null ? null : <><span aria-hidden="true">★</span> {formatCount(repo.stars)}</>}
            <span className={styles.navRepoLabel}>GitHub</span> <ArrowIcon />
          </a>
        </div>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} />
            The story is still alive
          </div>
          <h1>
            You choose the cliffhanger.
            <span> We write tomorrow.</span>
          </h1>
          <p className={styles.lede}>
            Short dramas that listen back. Watch tonight, make the call, and the
            winning twist becomes the next episode.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primaryAction}
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
            >
              Follow the build <ArrowIcon />
            </a>
            <a className={styles.textAction} href="#stories">
              See tonight’s stories <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className={styles.openSource}>
            Open source · React Native · Built by Mukhsin Mukhtorov
          </p>
        </div>

        <div className={styles.stage} aria-label="Dramatic episode preview">
          <div className={styles.glow} />
          <div className={styles.phone}>
            <div className={styles.episodeFrame}>
              <div className={styles.frameTop}>
                <span className={styles.livePill}>LIVE STORY</span>
                <span className={styles.soundButton} aria-hidden="true">
                  ◖))
                </span>
              </div>
              <div className={styles.caption}>
                “Then explain why your name is on the deed.”
              </div>
              <div className={styles.storyMeta}>
                <span>THE LAST ALIBI</span>
                <strong>Episode 14 · The signature</strong>
              </div>
              <div className={styles.voteCard}>
                <div>
                  <span>Your call</span>
                  <small>18,240 people are choosing</small>
                </div>
                <strong>Tell him the truth</strong>
                <div className={styles.voteTrack}>
                  <span />
                </div>
                <div className={styles.voteSplit}>
                  <span>62%</span>
                  <span>38%</span>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.writingNote}>
            <span className={styles.penIcon}>✦</span>
            <div>
              <strong>Episode 15 is being written</strong>
              <span>8,412 chose the betrayal</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.signalBar} aria-label="What makes Dramatic different">
        <div>
          <span>01</span>
          <strong>One new episode, every day</strong>
        </div>
        <div>
          <span>02</span>
          <strong>Your vote decides the branch</strong>
        </div>
        <div>
          <span>03</span>
          <strong>Built in public from day one</strong>
        </div>
      </section>

      <section className={styles.howSection} id="how">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionKicker}>Not a playlist. A living plot.</p>
          <h2>The audience gets a seat in the writers’ room.</h2>
          <p>
            No episodes gathering dust for months. Each story pauses at the moment
            that matters, waits for the audience, then keeps moving.
          </p>
        </div>
        <div className={styles.stepsGrid}>
          {steps.map((step) => (
            <article className={styles.stepCard} key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.storiesSection} id="stories">
        <div className={styles.storiesHeading}>
          <div>
            <p className={styles.sectionKicker}>Tonight’s unfinished stories</p>
            <h2>Pick your next bad decision.</h2>
          </div>
          <p>Four worlds. New cliffhangers daily. None of them know how they end yet.</p>
        </div>
        <div className={styles.storyGrid}>
          {stories.map((story, index) => (
            <article className={styles.storyCard} key={story.title}>
              <Image
                src={story.image}
                alt={`Cinematic key art for ${story.title}`}
                fill
                sizes="(max-width: 760px) 88vw, (max-width: 1100px) 45vw, 29vw"
                priority={index === 0}
                className={styles.storyImage}
              />
              <div className={styles.storyShade} />
              <div className={styles.storyTopline}>
                <span>{story.tone}</span>
                <span className={styles.votingPill}>
                  <i /> {story.votes}
                </span>
              </div>
              <div className={styles.storyBottom}>
                <span>{story.episode}</span>
                <h3>{story.title}</h3>
                <p>{story.hook}</p>
                <span className={styles.watchLabel}>
                  Series preview <b aria-hidden="true">9:16</b>
                </span>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.mediaNote}>
          Original launch artwork generated for this project. Final episodes will be
          reviewed before release.
        </p>
      </section>

      <section className={styles.engineSection}>
        <div className={styles.engineCopy}>
          <p className={styles.sectionKicker}>The nightly engine</p>
          <h2>The next episode doesn’t exist yet.</h2>
          <p>
            When voting closes, Dramatic turns the winning choice into a script,
            shot plan, character-consistent scenes, voice, captions, and a finished
            vertical episode. One provider boundary keeps the generation models
            swappable as the stack evolves.
          </p>
          <div className={styles.techPills} aria-label="Technology choices">
            <span>Expo + React Native</span>
            <span>Higgsfield SDK</span>
            <span>FFmpeg finishing</span>
          </div>
        </div>

        <div className={styles.pipelineCard} aria-label="Example episode generation progress">
          <div className={styles.pipelineHeader}>
            <div>
              <span>THE LAST ALIBI · EP 15</span>
              <strong>The betrayal</strong>
            </div>
            <span className={styles.renderingBadge}>
              <i /> Rendering
            </span>
          </div>
          <div className={styles.pipelinePreview}>
            <Image
              src="/media/the-last-alibi.png"
              alt="The Last Alibi generation preview"
              fill
              sizes="(max-width: 900px) 88vw, 520px"
              className={styles.pipelineImage}
            />
            <div className={styles.frameCounter}>SHOT 09 / 14</div>
            <div className={styles.subtitlePreview}>I signed it before I knew who you were.</div>
          </div>
          <ol className={styles.pipelineSteps}>
            <li className={styles.done}><span>✓</span><div><strong>Vote locked</strong><small>8,412 chose the betrayal</small></div></li>
            <li className={styles.done}><span>✓</span><div><strong>Script + shot list</strong><small>14 shots · 87 seconds</small></div></li>
            <li className={styles.active}><span>09</span><div><strong>Scenes rendering</strong><small>Character references attached</small></div></li>
            <li><span>04</span><div><strong>Voice, captions + QC</strong><small>Queued for review</small></div></li>
          </ol>
          <div className={styles.pipelineFooter}>
            <span><small>Preview cost</small><strong>$18.42</strong></span>
            <span><small>Elapsed</small><strong>07:36</strong></span>
            <span><small>Ready by</small><strong>8:00 AM</strong></span>
          </div>
        </div>
      </section>

      <section className={styles.openSection}>
        <div className={styles.starOrb} aria-hidden="true">★</div>
        <div className={styles.openCopy}>
          <p className={styles.sectionKicker}>Built in the open</p>
          <h2>Watch the product take shape. Or help shape it.</h2>
          <p>
            The app, landing page, shared contracts, and generation boundary live in
            one public repository. Read the code, open an issue, or leave a star so
            you can find your way back.
          </p>
        </div>
        <div className={styles.repoCard}>
          <div className={styles.repoName}>
            <SparkMark />
            <div>
              <strong>Mukhsin0508 / Dramatic</strong>
              <span>React Native · TypeScript · MIT</span>
            </div>
          </div>
          <div className={styles.repoStats}>
            <span><b>★</b><strong>{repo.stars === null ? "—" : formatCount(repo.stars)}</strong><small>{repo.stars === null ? "unavailable" : "stars"}</small></span>
            <span><b>⑂</b><strong>{repo.forks === null ? "—" : formatCount(repo.forks)}</strong><small>{repo.forks === null ? "unavailable" : "forks"}</small></span>
          </div>
          <a href={githubUrl} target="_blank" rel="noreferrer">
            View the repository <ArrowIcon />
          </a>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionKicker}>Tomorrow is unwritten</p>
        <h2>One more episode.<br />One impossible choice.</h2>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          Star Dramatic on GitHub <span aria-hidden="true">★</span>
        </a>
      </section>

      <footer className={styles.footer}>
        <Brand />
        <p>Audience-directed short drama, built by Mukhsin Mukhtorov.</p>
        <a href={githubUrl} target="_blank" rel="noreferrer">GitHub <ArrowIcon /></a>
      </footer>
    </main>
  );
}
