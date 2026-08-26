import Image from "next/image";
import { NavGitHubLink, RepoCardStats } from "@/components/repo-stats";
import { LANDING_STORIES as stories } from "@/data/stories.generated";
import styles from "./page.module.css";

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
          <a href="#live">Live demo</a>
          <a href="#stories">Stories</a>
          <a href="#how">How it works</a>
          <NavGitHubLink
            href={githubUrl}
            apiUrl={githubRepository.apiUrl}
            initialStars={repo.stars}
            initialForks={repo.forks}
          />
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
              <video
                className={styles.heroVideo}
                autoPlay
                muted
                loop
                playsInline
                poster="/media/two-rings-at-the-funeral.png"
                aria-label="Two Rings at the Funeral generated video teaser"
              >
                <source src="/media/two-rings-at-the-funeral-01.mp4" type="video/mp4" />
              </video>
              <div className={styles.frameTop}>
                <span className={styles.livePill}>REAL API OUTPUT</span>
                <span className={styles.soundButton} aria-hidden="true">
                  9:16
                </span>
              </div>
              <div className={styles.caption}>
                10-second generated scene
              </div>
              <div className={styles.storyMeta}>
                <span>TWO RINGS AT THE FUNERAL</span>
                <strong>Teaser · The Other Widow</strong>
              </div>
              <div className={styles.voteCard}>
                <div>
                  <span>Your call</span>
                  <small>Voting is open</small>
                </div>
                <strong>Which lead should the widows follow first?</strong>
                <div className={styles.voteOptions}>
                  <span>Open the coffin</span>
                  <span>Trace the transfer</span>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.writingNote}>
            <span className={styles.penIcon}>✦</span>
            <div>
              <strong>Generated and ready to play</strong>
              <span>$0.21 estimate · 10 sec · vertical</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.liveSection} id="live" aria-label="Live interactive demo of the Dramatic app">
        <div className={styles.liveCopy}>
          <p className={styles.sectionKicker}>No install. No clone. No waitlist.</p>
          <h2>This phone is real. Go ahead.</h2>
          <p>
            The exact app from the repository, compiled for the web and running
            live on this page. Scroll the feed, watch the generated episodes,
            open a story, cast your vote — it all works.
          </p>
          <ul className={styles.liveHints}>
            <li><span>↑</span> Scroll inside the phone for the next story</li>
            <li><span>▶</span> Tap the video to pause and resume</li>
            <li><span>⑂</span> Hit “Your call” to vote on the next episode</li>
          </ul>
          <p className={styles.liveFootnote}>
            Best experienced on the iOS build — this is the same code, rendered
            with React Native Web. Demo audio starts muted.
          </p>
        </div>
        <div className={styles.liveStage}>
          <div className={styles.liveGlow} />
          <div className={styles.livePhone}>
            <div className={styles.liveNotch} />
            <iframe
              className={styles.liveFrame}
              src="/app/"
              title="Dramatic app — live interactive demo"
              loading="lazy"
              allow="autoplay; fullscreen"
            />
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

      <section
        className={styles.walkthroughSection}
        id="walkthrough"
        aria-label="Recorded walkthrough of the Dramatic mobile app"
      >
        <div className={styles.walkthroughStage}>
          <div className={styles.walkthroughGlow} />
          <div className={styles.walkthroughPhone}>
            <video
              className={styles.walkthroughVideo}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/media/app-walkthrough-poster.jpg"
              aria-label="Screen recording of the Dramatic iOS app playing generated episodes and casting a story vote"
            >
              <source src="/media/app-walkthrough.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
        <div className={styles.walkthroughCopy}>
          <p className={styles.sectionKicker}>Straight from the simulator</p>
          <h2>The real app, playing real scenes.</h2>
          <p>
            One uncut screen recording of the current build. The watch feed
            autoplays each generated cold open, landscape scenes float on an
            ambient blur while portrait teasers go full-bleed, and every story
            ends on a choice.
          </p>
          <ul className={styles.walkthroughList}>
            <li>
              <strong>A feed that plays itself</strong>
              <span>Swipe between stories; the visible episode starts on its own</span>
            </li>
            <li>
              <strong>Cinematic letterbox</strong>
              <span>Widescreen scenes sit on a blurred echo of their own key art</span>
            </li>
            <li>
              <strong>Your call, saved</strong>
              <span>Votes persist on device and point at tomorrow&apos;s episode</span>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.storiesSection} id="stories">
        <div className={styles.storiesHeading}>
          <div>
            <p className={styles.sectionKicker}>Tonight’s unfinished stories</p>
            <h2>Pick your next bad decision.</h2>
          </div>
          <p>Eight worlds. Five playable previews. None of them know how they end yet.</p>
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
                  {story.mediaLabel} · {story.runtimeLabel}
                </span>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.mediaNote}>
          Five playable media previews are checked in. Cold opens and teasers are
          labeled by their real runtime; full episodes still require human review.
        </p>
      </section>

      <section className={styles.engineSection}>
        <div className={styles.engineCopy}>
          <p className={styles.sectionKicker}>The nightly engine</p>
          <h2>The next episode doesn’t exist yet.</h2>
          <p>
            The production plan carries a winning choice from script to shot list,
            character-consistent scenes, voice, captions, and final review. The
            checked-in generator already handles cost checks, submission, polling,
            durable downloads, and sanitized receipts through one swappable boundary.
          </p>
          <div className={styles.techPills} aria-label="Technology choices">
            <span>Expo + React Native</span>
            <span>Higgsfield SDK</span>
            <span>FFmpeg finishing</span>
          </div>
        </div>

        <div className={styles.pipelineCard} aria-label="Completed Higgsfield generation receipt">
          <div className={styles.pipelineHeader}>
            <div>
              <span>TWO RINGS AT THE FUNERAL · TEASER 01</span>
              <strong>The Other Widow</strong>
            </div>
            <span className={styles.renderingBadge}>
              <i /> Complete
            </span>
          </div>
          <div className={styles.pipelinePreview}>
            <Image
              src="/media/two-rings-at-the-funeral.png"
              alt="Two Rings at the Funeral generated keyframe"
              fill
              sizes="(max-width: 900px) 88vw, 520px"
              className={styles.pipelineImage}
            />
            <div className={styles.frameCounter}>10 SEC · 9:16</div>
            <div className={styles.subtitlePreview}>One coffin. Two wives. No body.</div>
          </div>
          <ol className={styles.pipelineSteps}>
            <li className={styles.done}><span>✓</span><div><strong>Cost checked</strong><small>Estimated before submission</small></div></li>
            <li className={styles.done}><span>✓</span><div><strong>Prompt + reference locked</strong><small>Three timed thriller blocks</small></div></li>
            <li className={styles.done}><span>✓</span><div><strong>Video generated</strong><small>720p vertical MP4 downloaded</small></div></li>
            <li className={styles.done}><span>✓</span><div><strong>Integrity logged</strong><small>SHA-256 + sanitized public receipt</small></div></li>
          </ol>
          <div className={styles.pipelineFooter}>
            <span><small>Est. cost</small><strong>$0.21</strong></span>
            <span><small>Generation</small><strong>01:24</strong></span>
            <span><small>Output</small><strong>8.4 MB</strong></span>
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
          <RepoCardStats
            apiUrl={githubRepository.apiUrl}
            initialStars={repo.stars}
            initialForks={repo.forks}
          />
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
