import type { Story } from '@/data/stories';

type StoryMedia = Pick<Story, 'episode' | 'mediaKind' | 'videoSource'>;
type StoryProgressMedia = Pick<Story, 'episodeId' | 'mediaKind'>;

export function mediaNoun(story: StoryMedia): 'cold open' | 'episode' | 'teaser' {
  if (story.mediaKind === 'cold-open') return 'cold open';
  return story.mediaKind;
}

export function mediaLabel(story: StoryMedia): string {
  const noun = mediaNoun(story);
  return noun === 'episode' ? `episode ${story.episode}` : noun;
}

export function mediaLabelTitle(story: StoryMedia): string {
  const label = mediaLabel(story);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function mediaAvailabilityLabel(story: StoryMedia): string {
  if (!story.videoSource) return `Episode ${story.episode} coming soon`;
  return mediaLabelTitle(story);
}

export function mediaEpisodeEyebrow(story: StoryMedia): string {
  const noun = mediaNoun(story);
  return noun === 'episode'
    ? `EPISODE ${story.episode}`
    : `${noun.toUpperCase()} · EPISODE ${story.episode}`;
}

export function mediaProgressKey(story: StoryProgressMedia): string {
  return `${story.episodeId}:${story.mediaKind}`;
}
