import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet, AppText, PrimaryButton } from '@/components/primitives';
import { PaywallSheet, VoteSheet } from '@/components/experience-sheets';
import { colors, motion, radius, space } from '@/constants/tokens';
import { useExperience, type WatchProgress } from '@/context/experience';
import { usePreferences } from '@/context/preferences';
import { STORIES, Story } from '@/data/stories';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptics } from '@/lib/haptics';
import {
  mediaAvailabilityLabel,
  mediaLabel,
  mediaLabelTitle,
  mediaNoun,
  mediaProgressKey,
} from '@/lib/story-media';

export default function WatchScreen() {
  const { story: requestedStory } = useLocalSearchParams<{ story?: string }>();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const preferences = usePreferences();
  const experience = useExperience();
  const [screenFocused, setScreenFocused] = useState(false);
  const [pageHeight, setPageHeight] = useState(0);
  const requestedIndex = Math.max(0, STORIES.findIndex(item => item.id === requestedStory));
  const [activeIndex, setActiveIndex] = useState(requestedIndex);
  const [voteOpen, setVoteOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const feedRef = useRef<FlatList<Story>>(null);
  const storyHeight = pageHeight || Math.max(480, windowHeight - 80);
  const activeStory = STORIES[activeIndex] ?? STORIES[0];

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    return () => setScreenFocused(false);
  }, []));

  useEffect(() => {
    if (!pageHeight) return;
    const index = Math.max(0, STORIES.findIndex(item => item.id === requestedStory));
    const frame = requestAnimationFrame(() => {
      setActiveIndex(index);
      feedRef.current?.scrollToOffset({ offset: index * pageHeight, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageHeight, requestedStory]);

  const changeEpisode = (index: number) => {
    const safeIndex = Math.max(0, Math.min(STORIES.length - 1, index));
    setActiveIndex(safeIndex);
    const story = STORIES[safeIndex];
    AccessibilityInfo.announceForAccessibility(`${mediaAvailabilityLabel(story)}, ${story.title}`);
    if (story.locked) setPaywallOpen(true);
  };

  return (
    <View style={styles.root} onLayout={event => setPageHeight(event.nativeEvent.layout.height)}>
      <FlatList
        ref={feedRef}
        data={STORIES}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <StoryPage
            story={item}
            height={storyHeight}
            active={screenFocused && index === activeIndex}
            hydrated={experience.hydrated && preferences.hydrated}
            liked={experience.likedIds.has(item.episodeId)}
            saved={experience.savedIds.has(item.id)}
            locked={!!item.locked}
            reducedMotion={reducedMotion}
            autoplay={preferences.autoplay}
            progress={experience.watchProgress[mediaProgressKey(item)]}
            selectedVote={experience.voteChoices[item.episodeId]}
            onProgress={(position, duration, completed) => experience.setWatchProgress(mediaProgressKey(item), position, duration, completed)}
            onVote={() => setVoteOpen(true)}
            onPaywall={() => setPaywallOpen(true)}
            onLike={() => { experience.toggleLiked(item.episodeId); haptics.selection(); }}
            onSave={() => { experience.toggleSaved(item.id); haptics.selection(); }}
            onDetails={() => router.push({ pathname: '/story/[id]', params: { id: item.id } })}
            onOptions={() => setOptionsOpen(true)}
            onShare={() => { void Share.share({ message: `Watch the ${mediaLabel(item)} from ${item.title} on Dramatic — then help choose what happens next. https://github.com/Mukhsin0508/Dramatic` }); }}
          />
        )}
        getItemLayout={(_, index) => ({ length: storyHeight, offset: storyHeight * index, index })}
        initialScrollIndex={requestedIndex}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        pagingEnabled
        snapToInterval={storyHeight}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={event => changeEpisode(Math.round(event.nativeEvent.contentOffset.y / storyHeight))}
      />
      {activeStory.vote ? (
        <VoteSheet
          visible={voteOpen}
          question={activeStory.vote.question}
          choices={activeStory.vote.choices}
          selectedChoice={experience.voteChoices[activeStory.episodeId]}
          onSelect={choice => experience.selectVote(activeStory.episodeId, choice)}
          onClose={() => setVoteOpen(false)}
        />
      ) : null}
      <PaywallSheet visible={paywallOpen} episodeNumber={activeStory.episode} onClose={() => setPaywallOpen(false)} />
      <BottomSheet visible={optionsOpen} onClose={() => setOptionsOpen(false)} title="Player options">
        <View style={styles.options}>
          <ToggleOption label="Autoplay videos" detail={!preferences.hydrated ? 'Loading your saved preference' : preferences.autoplay ? 'Starts playable media when it comes into view' : 'Tap play when you’re ready'} icon="play.fill" value={preferences.autoplay} disabled={!preferences.hydrated} onValueChange={preferences.setAutoplay} />
          <Option label="Playback" detail={`Autoplay ${preferences.autoplay ? 'on' : 'off'}`} icon="gearshape.fill" onPress={() => { setOptionsOpen(false); router.push('../settings'); }} />
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
  const { width } = useWindowDimensions();
  const hasVideo = story.videoSource != null;
  const noun = mediaNoun(story);
  const playableLabel = mediaLabel(story);
  const playableTitle = mediaLabelTitle(story);
  // The source is attached only while this page is active: offscreen
  // AVPlayer layers misbehave (notably on the iOS simulator, where an
  // invisible player can race to the end of its item), and a feed only ever
  // needs the visible page playing. Inactive pages show their poster.
  const player = useVideoPlayer(null, instance => {
    instance.loop = false;
    instance.timeUpdateEventInterval = 0.5;
  });
  const [status, setStatus] = useState<VideoPlayerStatus>(player.status);
  const [playing, setPlaying] = useState(player.playing);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(progress?.durationSeconds ?? 0);
  const [firstFrame, setFirstFrame] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const attached = useRef(false);
  const activeRef = useRef(active);
  const onProgressRef = useRef(onProgress);
  const positionRef = useRef(position);
  const durationRef = useRef(duration);
  const lastPersistedSecond = useRef(0);

  useEventListener(player, 'statusChange', event => {
    setStatus(event.status);
    setErrorMessage(event.status === 'error' ? `We couldn’t start this ${noun}. Try again.` : null);
    if (event.status === 'readyToPlay') setDuration(player.duration);
  });
  useEventListener(player, 'playingChange', event => {
    setPlaying(event.isPlaying);
    if (!event.isPlaying && durationRef.current > 0 && activeRef.current) {
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
    // A seek issued while the item is still preparing can clamp to the end of
    // the video and fire a false playToEnd; only trust the event when the
    // playhead is actually at the end.
    if (player.duration > 0 && player.currentTime < player.duration - 1) return;
    const finalDuration = player.duration;
    positionRef.current = finalDuration;
    durationRef.current = finalDuration;
    setPosition(finalDuration);
    setPlaying(false);
    // Only the visible page reflects real viewing — off-screen players must
    // not write watch progress.
    if (activeRef.current) onProgressRef.current(finalDuration, finalDuration, true);
  });

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    positionRef.current = position;
    durationRef.current = duration;
  }, [duration, position]);

  useEffect(() => {
    if (!hasVideo) return;
    if (active && !locked) {
      if (attached.current) return;
      attached.current = true;
      setFirstFrame(false);
      setErrorMessage(null);
      void player.replaceAsync(story.videoSource ?? null).catch(() => {
        attached.current = false;
        setStatus('error');
        setErrorMessage(`We couldn’t start this ${noun}. Try again.`);
      });
      return;
    }
    if (attached.current) {
      attached.current = false;
      player.pause();
      void player.replaceAsync(null).catch(() => {});
      setFirstFrame(false);
      setPlaying(false);
      positionRef.current = 0;
      setPosition(0);
    }
  }, [active, hasVideo, locked, noun, player, story.videoSource]);

  useEffect(() => {
    if (!hasVideo) return;
    if (!active || locked || !autoplay) {
      player.pause();
      return;
    }
    if (!hydrated || status !== 'readyToPlay') return;
    // Clips are 6–30s scenes: each activation plays from the top. Saved
    // progress still powers Library's continue-watching display.
    if (player.duration > 0 && player.currentTime >= player.duration - 0.5) {
      player.currentTime = 0;
      positionRef.current = 0;
      setPosition(0);
    }
    player.play();
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
      player.currentTime = 0;
      positionRef.current = 0;
      setPosition(0);
      player.play();
    } else player.play();
  };
  const retry = () => {
    if (!story.videoSource) return;
    attached.current = true;
    setFirstFrame(false);
    setErrorMessage(null);
    void player.replaceAsync(story.videoSource).catch(() => {
      attached.current = false;
      setStatus('error');
      setErrorMessage(`We couldn’t start this ${noun}. Try again.`);
    });
  };
  const progressFraction = duration > 0 ? Math.max(0, Math.min(position / duration, 1)) : 0;
  const progressPercent = Math.round(progressFraction * 100);
  const availabilityLabel = !hasVideo
    ? 'COMING SOON'
    : story.mediaKind === 'cold-open'
      ? 'COLD OPEN'
      : story.mediaKind === 'teaser'
        ? 'TEASER'
        : 'WATCH & CHOOSE';

  // Full-bleed for portrait-ish sources; ambient letterbox for landscape ones.
  const videoAspect = story.videoAspect ?? 16 / 9;
  const pageAspect = width / height;
  const fullBleed = hasVideo && videoAspect <= pageAspect * 1.2;
  const frameHeight = Math.round(width / videoAspect);
  const frameTop = Math.round(height * 0.42 - frameHeight / 2);
  const stateCenter = hasVideo && !fullBleed ? frameTop + Math.round(frameHeight / 2) : Math.round(height * 0.42);
  const showLoading = hasVideo && !locked && active && (status === 'loading' || status === 'idle') && !firstFrame;
  const showPlayGlyph = hasVideo && !locked && status === 'readyToPlay' && !playing;
  const canToggle = hasVideo && !locked && status === 'readyToPlay';

  return (
    <View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
      style={[styles.story, { height }]}
    >
      {fullBleed ? (
        <Image source={story.poster} style={StyleSheet.absoluteFill} contentFit="cover" transition={reducedMotion ? 0 : 220} accessibilityLabel={`${story.title} poster`} />
      ) : (
        <>
          <Image source={story.poster} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={48} transition={reducedMotion ? 0 : 220} accessibilityLabel={`${story.title} poster`} />
          <View style={styles.backdropDim} />
          {hasVideo ? (
            <View style={[styles.videoFrame, { top: frameTop, height: frameHeight }]}>
              <Image source={story.poster} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            </View>
          ) : null}
        </>
      )}
      {hasVideo ? (
        <View pointerEvents="none" style={fullBleed ? StyleSheet.absoluteFill : [styles.videoFrame, { top: frameTop, height: frameHeight }]}>
          <VideoView
            player={player}
            style={[StyleSheet.absoluteFill, !firstFrame && styles.videoHidden]}
            contentFit={fullBleed ? 'cover' : 'contain'}
            nativeControls={false}
            onFirstFrameRender={() => setFirstFrame(true)}
          />
        </View>
      ) : null}
      <LinearGradient colors={['rgba(8,7,10,.82)', 'rgba(8,7,10,0)']} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={['rgba(8,7,10,0)', 'rgba(8,7,10,.58)', 'rgba(8,7,10,.96)']} locations={[0, 0.42, 1]} style={styles.bottomScrim} pointerEvents="none" />

      {canToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? `Pause ${playableLabel}` : progressFraction > 0 ? `Resume ${playableLabel}` : `Play ${playableLabel}`}
          accessibilityState={{ selected: playing }}
          onPress={togglePlayback}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Player options" onPress={onOptions} style={styles.topIcon}><SymbolView name="ellipsis" size={23} tintColor={colors.text} /></Pressable>
      </SafeAreaView>

      {showLoading ? (
        <View pointerEvents="none" style={[styles.playbackState, { top: stateCenter - 24 }]}>
          <View accessibilityRole="progressbar" accessibilityLabel={`Loading ${playableLabel}`} style={styles.loadingPill}><ActivityIndicator color={colors.text} /><AppText variant="caption">Loading {playableLabel}</AppText></View>
        </View>
      ) : null}
      {status === 'error' && !locked && hasVideo ? (
        <View style={[styles.playbackState, { top: stateCenter - 70 }]}>
          <View accessibilityRole="alert" style={styles.errorCard}>
            <AppText variant="label">Couldn’t play this {noun}</AppText>
            <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>{errorMessage ?? 'Try again in a moment.'}</AppText>
            <PrimaryButton label="Try again" variant="surface" onPress={retry} />
          </View>
        </View>
      ) : null}
      {showPlayGlyph ? (
        <View pointerEvents="none" style={[styles.playbackState, { top: stateCenter - 34 }]}>
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(motion.fast)}
            exiting={reducedMotion ? undefined : FadeOut.duration(motion.fast)}
          >
            <View style={styles.playControl}><SymbolView name="play.fill" size={27} tintColor={colors.text} /></View>
          </Animated.View>
        </View>
      ) : null}

      {!locked && !hasVideo ? (
        <View pointerEvents="none" style={[styles.playbackState, { top: stateCenter - 76 }]}>
          <View style={styles.mediaPending}>
            <View style={styles.pendingIcon}><SymbolView name="film.stack" size={24} tintColor={colors.text} /></View>
            <AppText variant="label">Episode {story.episode} is on its way</AppText>
            <AppText variant="caption" color={colors.textSecondary} style={styles.pendingCopy}>Explore the story and make your choice while it gets ready.</AppText>
          </View>
        </View>
      ) : null}

      {locked ? <View style={styles.locked}><View style={styles.lockCircle}><SymbolView name="lock.fill" size={25} tintColor={colors.text} /></View><AppText variant="title2">{playableTitle} locked</AppText><AppText color={colors.textSecondary}>The next scene is ready when you are.</AppText><PrimaryButton label="Keep watching" onPress={onPaywall} /></View> : null}
      <View pointerEvents={locked ? 'none' : 'box-none'} style={styles.bottomContent}>
        <View pointerEvents="box-none" style={styles.copy}>
          <View style={[styles.availabilityBadge, story.mediaKind === 'teaser' && hasVideo && styles.availabilityBadgeOutline, !hasVideo && styles.availabilityBadgeMuted]}>
            <AppText
              variant="caption"
              color={!hasVideo ? colors.textSecondary : story.mediaKind === 'teaser' ? colors.brand : colors.textInverse}
              style={styles.availabilityText}
            >{availabilityLabel}</AppText>
          </View>
          <AppText variant="title1" style={styles.overlayText}>{story.title}</AppText>
          <AppText variant="caption" color={colors.textSecondary} style={styles.overlayText}>
            {`EP ${story.episode} of ${story.episodeCount} · ${story.episodeTitle}${hasVideo ? ` · ${story.runtimeLabel}` : ''}`}
          </AppText>
          <AppText color="rgba(252,248,252,.84)" numberOfLines={2} style={styles.overlayText}>{story.synopsis}</AppText>
          <Pressable accessibilityRole="button" onPress={onDetails} hitSlop={8} style={styles.detailsLink}>
            <AppText variant="label" color={colors.textSecondary}>More about this story</AppText>
            <SymbolView name="chevron.right" size={13} tintColor={colors.textSecondary} />
          </Pressable>
          {story.vote ? <Pressable accessibilityRole="button" accessibilityHint={story.vote.question} onPress={onVote} style={({ pressed }) => [styles.votePrompt, pressed && styles.votePressed]}><View style={styles.voteIcon}><SymbolView name={selectedVote ? 'checkmark' : 'arrow.triangle.branch'} size={19} tintColor={colors.brand} /></View><View style={{ flex: 1 }}><AppText variant="label" color={colors.textInverse}>{selectedVote ? 'Your choice' : 'Your call'}</AppText><AppText variant="caption" color="rgba(25,8,14,.78)" numberOfLines={2}>{selectedVote ?? story.vote.question}</AppText></View><SymbolView name="chevron.right" size={17} tintColor={colors.textInverse} /></Pressable> : null}
        </View>
        <View style={styles.rail}>
          <RailButton name={liked ? 'heart.fill' : 'heart'} label={liked ? `Unlike ${playableLabel}` : `Like ${playableLabel}`} selected={liked} onPress={onLike} />
          <RailButton name={saved ? 'bookmark.fill' : 'bookmark'} label={saved ? 'Remove story from Library' : 'Save story to Library'} selected={saved} onPress={onSave} />
          <RailButton name="square.and.arrow.up" label={`Share ${playableLabel}`} onPress={onShare} />
        </View>
      </View>
      {hasVideo ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${progressPercent} percent of ${playableLabel} watched`}
          accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
          style={styles.progressTrack}
        >
          <View style={[styles.progress, { width: `${progressFraction * 100}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function RailButton({ name, label, onPress, selected = false }: { name: React.ComponentProps<typeof SymbolView>['name']; label: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.railButton, pressed && styles.railPressed]}>
      <SymbolView name={name} size={29} tintColor={selected ? colors.brand : colors.text} />
    </Pressable>
  );
}

function Option({ label, detail, icon, onPress }: { label: string; detail: string; icon: React.ComponentProps<typeof SymbolView>['name']; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.option}><View style={styles.optionIcon}><SymbolView name={icon} size={20} tintColor={colors.text} /></View><View style={{ flex: 1 }}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textSecondary}>{detail}</AppText></View><SymbolView name="chevron.right" size={17} tintColor={colors.textMuted} /></Pressable>;
}

function ToggleOption({ label, detail, icon, value, disabled = false, onValueChange }: { label: string; detail: string; icon: React.ComponentProps<typeof SymbolView>['name']; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)} style={styles.option}><View style={styles.optionIcon}><SymbolView name={icon} size={20} tintColor={colors.text} /></View><View style={{ flex: 1 }}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textSecondary}>{detail}</AppText></View><View pointerEvents="none"><Switch accessible={false} disabled={disabled} value={value} trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.text} /></View></Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  story: { width: '100%', overflow: 'hidden', backgroundColor: colors.canvas },
  backdropDim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,7,10,.6)' },
  videoFrame: { position: 'absolute', left: 0, right: 0, overflow: 'hidden', backgroundColor: '#000' },
  videoHidden: { opacity: 0 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 190 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 360 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg, paddingTop: space.sm, flexDirection: 'row', justifyContent: 'flex-end' },
  topIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(8,7,10,.4)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.18)' },
  availabilityBadge: { alignSelf: 'flex-start', marginBottom: 2, paddingHorizontal: space.sm + 2, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brand },
  availabilityBadgeOutline: { backgroundColor: 'rgba(8,7,10,.45)', borderWidth: 1, borderColor: colors.brand },
  availabilityBadgeMuted: { backgroundColor: 'rgba(255,255,255,.14)' },
  availabilityText: { letterSpacing: 1.4, fontWeight: '700', fontSize: 11, lineHeight: 14 },
  overlayText: { textShadowColor: 'rgba(0,0,0,.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  playbackState: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  playControl: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,7,10,.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,.3)' },
  loadingPill: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: 'rgba(8,7,10,.72)' },
  errorCard: { width: '78%', padding: space.lg, borderRadius: radius.card, gap: space.sm, backgroundColor: 'rgba(8,7,10,.9)', borderWidth: 1, borderColor: colors.border },
  mediaPending: { marginHorizontal: space.xxxl, alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.card, backgroundColor: 'rgba(13,11,16,.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' },
  pendingIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  pendingCopy: { textAlign: 'center' },
  bottomContent: { position: 'absolute', left: space.lg, right: space.md, bottom: space.xl, flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  copy: { flex: 1, gap: space.sm, paddingBottom: space.xs },
  detailsLink: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rail: { width: 52, alignItems: 'center', gap: space.lg, paddingBottom: 84 },
  railButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  railPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  votePrompt: { marginTop: space.xs, minHeight: 60, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: 14, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', gap: space.md },
  votePressed: { backgroundColor: colors.brandPressed },
  voteIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(25,8,14,.85)', alignItems: 'center', justifyContent: 'center' },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,.18)' },
  progress: { height: 2, backgroundColor: colors.brand },
  locked: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 3, paddingHorizontal: space.xxxl, backgroundColor: 'rgba(8,7,10,.72)', alignItems: 'center', justifyContent: 'center', gap: space.md },
  lockCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  options: { paddingBottom: space.xxl },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
