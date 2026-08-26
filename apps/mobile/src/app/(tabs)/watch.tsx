import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet, AppText, IconButton, PrimaryButton } from '@/components/primitives';
import { PaywallSheet, VoteSheet } from '@/components/experience-sheets';
import { colors, radius, space } from '@/constants/tokens';
import { useExperience, type WatchProgress } from '@/context/experience';
import { usePreferences } from '@/context/preferences';
import { STORIES, Story } from '@/data/stories';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';

export default function WatchScreen() {
  const { story: requestedStory } = useLocalSearchParams<{ story?: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const preferences = usePreferences();
  const experience = useExperience();
  const [pageHeight, setPageHeight] = useState(0);
  const requestedIndex = Math.max(0, STORIES.findIndex(item => item.id === requestedStory));
  const [activeIndex, setActiveIndex] = useState(requestedIndex);
  const [voteOpen, setVoteOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const feedRef = useRef<ScrollView>(null);
  const storyHeight = pageHeight || Math.max(480, windowHeight - 80);
  const activeStory = STORIES[activeIndex] ?? STORIES[0];

  useEffect(() => {
    if (!pageHeight) return;
    const index = Math.max(0, STORIES.findIndex(item => item.id === requestedStory));
    const frame = requestAnimationFrame(() => {
      setActiveIndex(index);
      feedRef.current?.scrollTo({ y: index * pageHeight, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageHeight, requestedStory]);

  const changeEpisode = (index: number) => {
    const safeIndex = Math.max(0, Math.min(STORIES.length - 1, index));
    setActiveIndex(safeIndex);
    const story = STORIES[safeIndex];
    AccessibilityInfo.announceForAccessibility(`Episode ${story.episode}, ${story.title}`);
    if (story.locked) setPaywallOpen(true);
  };

  return (
    <View style={styles.root} onLayout={event => setPageHeight(event.nativeEvent.layout.height)}>
      <ScrollView
        ref={feedRef}
        pagingEnabled
        snapToInterval={storyHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={event => changeEpisode(Math.round(event.nativeEvent.contentOffset.y / storyHeight))}
      >
        {STORIES.map((item, index) => (
          <StoryPage
            key={item.id}
            story={item}
            height={storyHeight}
            active={index === activeIndex}
            hydrated={experience.hydrated}
            liked={experience.likedIds.has(item.episodeId)}
            saved={experience.savedIds.has(item.id)}
            locked={!!item.locked}
            reducedMotion={reducedMotion}
            autoplay={preferences.autoplay}
            progress={experience.watchProgress[item.episodeId]}
            selectedVote={experience.voteChoices[item.episodeId]}
            onProgress={(position, duration, completed) => experience.setWatchProgress(item.episodeId, position, duration, completed)}
            onVote={() => setVoteOpen(true)}
            onPaywall={() => setPaywallOpen(true)}
            onLike={() => { experience.toggleLiked(item.episodeId); haptics.selection(); }}
            onSave={() => { experience.toggleSaved(item.id); haptics.selection(); }}
            onDetails={() => router.push({ pathname: '/story/[id]', params: { id: item.id } })}
            onOptions={() => setOptionsOpen(true)}
            onShare={() => { void Share.share({ message: `${item.title} on Dramatic — help choose what happens next. https://github.com/Mukhsin0508/Dramatic` }); }}
          />
        ))}
      </ScrollView>
      <VoteSheet
        visible={voteOpen}
        question={activeStory.vote?.question ?? 'What happens next?'}
        choices={activeStory.vote?.choices ?? ['Keep the secret', 'Tell the truth']}
        selectedChoice={experience.voteChoices[activeStory.episodeId]}
        onSelect={choice => experience.selectVote(activeStory.episodeId, choice)}
        onClose={() => setVoteOpen(false)}
      />
      <PaywallSheet visible={paywallOpen} episodeNumber={activeStory.episode} onClose={() => setPaywallOpen(false)} />
      <BottomSheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title="Player options">
        <View style={styles.options}>
          <ToggleOption label="Captions" detail={preferences.captions ? 'On by default' : 'Off by default'} icon="captions.bubble.fill" value={preferences.captions} onValueChange={preferences.setCaptions} />
          <ToggleOption label="Autoplay videos" detail={preferences.autoplay ? 'Starts when you swipe to an episode' : 'Tap play to begin'} icon="play.fill" value={preferences.autoplay} onValueChange={preferences.setAutoplay} />
          <Option label="Playback and alerts" detail={`${preferences.playbackQuality} quality · ${preferences.captionSize.toLowerCase()} captions`} icon="gearshape.fill" onPress={() => { setOptionsOpen(false); router.push('../settings'); }} />
          <Option label="About this story" detail={activeStory.title} icon="info.circle.fill" onPress={() => { setOptionsOpen(false); router.push({ pathname: '/story/[id]', params: { id: activeStory.id } }); }} />
        </View>
      </BottomSheet>
    </View>
  );
}

type StoryPageProps = {
  story: Story;
  height: number;
  active: boolean;
  hydrated: boolean;
  liked: boolean;
  saved: boolean;
  locked: boolean;
  reducedMotion: boolean;
  autoplay: boolean;
  progress?: WatchProgress;
  selectedVote?: string;
  onProgress: (position: number, duration: number, completed?: boolean) => void;
  onVote: () => void;
  onPaywall: () => void;
  onLike: () => void;
  onSave: () => void;
  onDetails: () => void;
  onOptions: () => void;
  onShare: () => void;
};

function StoryPage({ story, height, active, hydrated, liked, saved, locked, reducedMotion, autoplay, progress, selectedVote, onProgress, onVote, onPaywall, onLike, onSave, onDetails, onOptions, onShare }: StoryPageProps) {
  const hasVideo = story.videoSource != null;
  const player = useVideoPlayer(story.videoSource ?? null, instance => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.5;
  });
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  const [playing, setPlaying] = useState(player.playing);
  const [position, setPosition] = useState(progress?.positionSeconds ?? 0);
  const [duration, setDuration] = useState(progress?.durationSeconds ?? 0);
  const [firstFrame, setFirstFrame] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const restored = useRef(false);
  const onProgressRef = useRef(onProgress);
  const positionRef = useRef(position);
  const durationRef = useRef(duration);
  const lastPersistedSecond = useRef(Math.floor(progress?.positionSeconds ?? 0));

  useEventListener(player, 'statusChange', event => {
    setStatus(event.status);
    setErrorMessage(event.error?.message ?? null);
    if (event.status === 'readyToPlay') setDuration(player.duration);
  });
  useEventListener(player, 'playingChange', event => {
    setPlaying(event.isPlaying);
    if (!event.isPlaying && durationRef.current > 0) {
      onProgressRef.current(positionRef.current, durationRef.current);
    }
  });
  useEventListener(player, 'timeUpdate', event => {
    const nextDuration = player.duration;
    positionRef.current = event.currentTime;
    durationRef.current = nextDuration;
    setPosition(event.currentTime);
    setDuration(nextDuration);
    const wholeSecond = Math.floor(event.currentTime);
    if (wholeSecond - lastPersistedSecond.current >= 5 && nextDuration > 0) {
      lastPersistedSecond.current = wholeSecond;
      onProgressRef.current(event.currentTime, nextDuration);
    }
  });
  useEventListener(player, 'playToEnd', () => {
    const finalDuration = player.duration;
    positionRef.current = finalDuration;
    durationRef.current = finalDuration;
    setPosition(finalDuration);
    setPlaying(false);
    onProgressRef.current(finalDuration, finalDuration, true);
  });

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    positionRef.current = position;
    durationRef.current = duration;
  }, [duration, position]);

  useEffect(() => {
    if (!hasVideo || !hydrated || status !== 'readyToPlay' || restored.current) return;
    const mediaDuration = player.duration;
    const resumeAt = progress && !progress.completed && progress.positionSeconds < mediaDuration - 1
      ? Math.max(0, progress.positionSeconds)
      : 0;
    player.seekBy(resumeAt - player.currentTime);
    positionRef.current = resumeAt;
    durationRef.current = mediaDuration;
    setPosition(resumeAt);
    setDuration(mediaDuration);
    restored.current = true;
  }, [hasVideo, hydrated, player, progress, status]);

  useEffect(() => {
    if (!hasVideo || locked || !hydrated || status !== 'readyToPlay' || !restored.current) return;
    if (!active) {
      player.pause();
      return;
    }
    if (autoplay) player.play();
  }, [active, autoplay, hasVideo, hydrated, locked, player, status]);

  useEffect(() => () => {
    if (durationRef.current > 0) onProgressRef.current(positionRef.current, durationRef.current);
  }, []);

  const togglePlayback = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (duration > 0 && position >= duration - 0.5) {
      lastPersistedSecond.current = 0;
      onProgressRef.current(0, duration);
      player.replay();
    } else player.play();
  };
  const retry = () => {
    if (!story.videoSource) return;
    restored.current = false;
    setFirstFrame(false);
    setErrorMessage(null);
    void player.replaceAsync(story.videoSource).catch(error => {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'The video could not be reopened.');
    });
  };
  const progressFraction = duration > 0 ? Math.max(0, Math.min(position / duration, 1)) : 0;

  return (
    <View style={[styles.story, { height }]}>
      <Image source={story.poster} style={StyleSheet.absoluteFill} contentFit="cover" transition={reducedMotion ? 0 : 220} accessibilityLabel={`${story.title} poster`} />
      {hasVideo ? (
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, !firstFrame && styles.videoHidden]}
          contentFit="cover"
          nativeControls={false}
          fullscreenOptions={{ enable: true }}
          onFirstFrameRender={() => setFirstFrame(true)}
        />
      ) : null}
      <LinearGradient colors={['rgba(8,7,10,.68)', 'transparent', 'rgba(8,7,10,.2)', 'rgba(8,7,10,.96)']} locations={[0, .22, .48, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View>
          <View style={styles.availabilityBadge}><AppText variant="caption" color={colors.text}>{hasVideo ? 'WATCH & CHOOSE' : 'VIDEO IN PRODUCTION'}</AppText></View>
          <AppText variant="label">{story.title}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Episode {story.episode} of {story.episodeCount}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Player options" onPress={onOptions} style={styles.topIcon}><SymbolView name="ellipsis" size={23} tintColor={colors.text} /></Pressable>
      </SafeAreaView>

      {!locked && hasVideo ? (
        <View pointerEvents="box-none" style={styles.playbackState}>
          {status === 'loading' || status === 'idle' ? (
            <View accessibilityRole="progressbar" accessibilityLabel="Loading episode" style={styles.loadingPill}><ActivityIndicator color={colors.text} /><AppText variant="caption">Loading episode</AppText></View>
          ) : status === 'error' ? (
            <View accessibilityRole="alert" style={styles.errorCard}>
              <AppText variant="label">Couldn’t play this episode</AppText>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>{errorMessage ?? 'The video could not be opened on this device.'}</AppText>
              <PrimaryButton label="Try again" variant="surface" onPress={retry} />
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause episode' : progressFraction > 0 ? 'Resume episode' : 'Play episode'}
              accessibilityState={{ selected: playing }}
              onPress={togglePlayback}
              style={({ pressed }) => [styles.playControl, playing && styles.playControlPlaying, pressed && styles.controlPressed]}
            >
              <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={playing ? 23 : 25} tintColor={colors.text} />
            </Pressable>
          )}
        </View>
      ) : null}

      {!locked && !hasVideo ? (
        <View pointerEvents="none" style={styles.mediaPending}>
          <View style={styles.pendingIcon}><SymbolView name="film.stack" size={24} tintColor={colors.text} /></View>
          <AppText variant="label">This episode is being made</AppText>
          <AppText variant="caption" color={colors.textSecondary} style={styles.pendingCopy}>Read the setup and choose a direction while the video is prepared.</AppText>
        </View>
      ) : null}

      {locked ? <View style={styles.locked}><View style={styles.lockCircle}><SymbolView name="lock.fill" size={25} tintColor={colors.text} /></View><AppText variant="title2">Episode locked</AppText><AppText color={colors.textSecondary}>The next scene is ready when you are.</AppText><PrimaryButton label="Keep watching" onPress={onPaywall} /></View> : null}
      <View pointerEvents={locked ? 'none' : 'auto'} style={styles.bottomContent}>
        <View style={styles.copy}>
          <AppText variant="caption" color={colors.brand} style={styles.episodeLabel}>EPISODE {story.episode}</AppText>
          <AppText variant="title2">{story.episodeTitle}</AppText>
          <AppText color={colors.textSecondary} numberOfLines={2}>{story.synopsis}</AppText>
          <Pressable accessibilityRole="button" onPress={onDetails} hitSlop={8} style={styles.detailsLink}><AppText variant="label">More about this story</AppText></Pressable>
          {story.vote ? <Pressable accessibilityRole="button" accessibilityHint={story.vote.question} onPress={onVote} style={styles.votePrompt}><View style={styles.voteIcon}><SymbolView name={selectedVote ? 'checkmark' : 'arrow.triangle.branch'} size={20} tintColor={colors.textInverse} /></View><View style={{ flex: 1 }}><AppText variant="label">{selectedVote ? 'Your choice' : 'Your call'}</AppText><AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>{selectedVote ?? story.vote.question}</AppText></View><SymbolView name="chevron.right" size={18} tintColor={colors.text} /></Pressable> : null}
        </View>
        <View style={styles.rail}>
          <IconButton name={liked ? 'heart.fill' : 'heart'} label={liked ? 'Unlike episode' : 'Like episode'} selected={liked} onPress={onLike} />
          <IconButton name={saved ? 'bookmark.fill' : 'bookmark'} label={saved ? 'Remove story from Library' : 'Save story to Library'} selected={saved} onPress={onSave} />
          <IconButton name="square.and.arrow.up" label="Share episode" onPress={onShare} />
        </View>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={duration > 0 ? `${Math.round(progressFraction * 100)} percent watched` : 'Episode not started'} style={styles.progressTrack}><View style={[styles.progress, { width: `${progressFraction * 100}%` }]} /></View>
    </View>
  );
}

function Option({ label, detail, icon, onPress }: { label: string; detail: string; icon: React.ComponentProps<typeof SymbolView>['name']; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.option}><View style={styles.optionIcon}><SymbolView name={icon} size={20} tintColor={colors.text} /></View><View style={{ flex: 1 }}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textSecondary}>{detail}</AppText></View><SymbolView name="chevron.right" size={17} tintColor={colors.textMuted} /></Pressable>;
}

function ToggleOption({ label, detail, icon, value, onValueChange }: { label: string; detail: string; icon: React.ComponentProps<typeof SymbolView>['name']; value: boolean; onValueChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onValueChange(!value)} style={styles.option}><View style={styles.optionIcon}><SymbolView name={icon} size={20} tintColor={colors.text} /></View><View style={{ flex: 1 }}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textSecondary}>{detail}</AppText></View><View pointerEvents="none"><Switch accessible={false} value={value} trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.text} /></View></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  story: { width: '100%', overflow: 'hidden', backgroundColor: colors.surface },
  videoHidden: { opacity: 0 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(8,7,10,.32)' },
  availabilityBadge: { alignSelf: 'flex-start', marginBottom: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(8,7,10,.62)' },
  playbackState: { position: 'absolute', top: '28%', left: 0, right: 0, alignItems: 'center' },
  playControl: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,7,10,.68)', borderWidth: 1, borderColor: 'rgba(255,255,255,.32)' },
  playControlPlaying: { opacity: .72 },
  controlPressed: { transform: [{ scale: .94 }] },
  loadingPill: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(8,7,10,.72)' },
  errorCard: { width: '78%', padding: space.lg, borderRadius: radius.card, gap: space.sm, backgroundColor: 'rgba(8,7,10,.9)', borderWidth: 1, borderColor: colors.border },
  mediaPending: { position: 'absolute', top: '24%', left: space.xxxl, right: space.xxxl, alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.card, backgroundColor: 'rgba(8,7,10,.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)' },
  pendingIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  pendingCopy: { textAlign: 'center' },
  bottomContent: { position: 'absolute', left: space.lg, right: space.md, bottom: space.xxl, flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  copy: { flex: 1, gap: space.sm, paddingBottom: space.md },
  episodeLabel: { letterSpacing: 1.1, fontWeight: '800' },
  detailsLink: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  rail: { width: 54, alignItems: 'center', gap: space.sm },
  votePrompt: { marginTop: space.sm, minHeight: 64, padding: space.md, borderRadius: radius.card, backgroundColor: 'rgba(32,28,36,.9)', borderWidth: 1, borderColor: colors.brand, flexDirection: 'row', alignItems: 'center', gap: space.md },
  voteIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: 'rgba(255,255,255,.2)' },
  progress: { height: 3, backgroundColor: colors.brand },
  locked: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3, paddingHorizontal: space.xxxl, backgroundColor: 'rgba(8,7,10,.72)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  lockCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  options: { paddingBottom: space.xxl },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
