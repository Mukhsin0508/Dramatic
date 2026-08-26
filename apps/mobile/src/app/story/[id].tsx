import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, PrimaryButton } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { useExperience } from '@/context/experience';
import { STORIES } from '@/data/stories';
import { haptics } from '@/lib/haptics';
import { mediaLabel, mediaProgressKey } from '@/lib/story-media';

export default function StoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const experience = useExperience();
  const story = STORIES.find(item => item.id === id);

  if (!story) {
    return (
      <SafeAreaView style={styles.missing}>
        <SymbolView name="film.stack" size={36} tintColor={colors.textMuted} />
        <AppText variant="title1" style={styles.missingText}>That story is off the air</AppText>
        <AppText color={colors.textSecondary} style={styles.missingText}>
          It may have moved, or the link may be out of date.
        </AppText>
        <PrimaryButton label="Back to Library" onPress={() => router.replace('/(tabs)/library')} />
      </SafeAreaView>
    );
  }

  const saved = experience.savedIds.has(story.id);
  const progress = experience.watchProgress[mediaProgressKey(story)];
  const isColdOpen = story.mediaKind === 'cold-open';
  const isTeaser = story.mediaKind === 'teaser';
  const isPreview = isColdOpen || isTeaser;
  const playableLabel = mediaLabel(story);
  const watchLabel = !story.videoSource
    ? `Open episode ${story.episode}`
    : progress?.completed
      ? `Watch ${playableLabel} again`
      : progress?.positionSeconds
        ? `Resume ${playableLabel}`
        : `Watch ${playableLabel}`;
  const openEpisode = () => router.replace({ pathname: '/(tabs)/watch', params: { story: story.id } });
  const shareStory = () => {
    void Share.share({
      message: story.videoSource
        ? `${story.title} on Dramatic — watch the ${playableLabel} and help choose what happens next. https://github.com/Mukhsin0508/Dramatic`
        : `${story.title} on Dramatic — explore the story and help choose what happens next. https://github.com/Mukhsin0508/Dramatic`,
    });
  };
  const toggleSaved = () => {
    experience.toggleSaved(story.id);
    haptics.selection();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image
            source={story.poster}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={`${story.title} key art`}
          />
          <LinearGradient colors={['rgba(8,7,10,.12)', colors.canvas]} style={StyleSheet.absoluteFill} />
        </View>

        <SafeAreaView edges={['top']} style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.circle}>
            <SymbolView name="chevron.left" size={21} tintColor={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share story" onPress={shareStory} style={styles.circle}>
            <SymbolView name="square.and.arrow.up" size={21} tintColor={colors.text} />
          </Pressable>
        </SafeAreaView>

        <View style={styles.content}>
          <AppText variant="caption" color={colors.brand} style={styles.upper}>{story.genres}</AppText>
          <AppText variant="display">{story.title}</AppText>
          <AppText color={colors.textSecondary}>{story.episodeCount} episodes planned · Audience-directed story</AppText>

          <View style={styles.actions}>
            <View style={styles.grow}>
              <PrimaryButton label={watchLabel} icon="play.fill" onPress={openEpisode} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={saved ? 'Remove story from Library' : 'Save story to Library'}
              accessibilityState={{ selected: saved }}
              onPress={toggleSaved}
              style={({ pressed }) => [styles.save, pressed && styles.pressed]}
            >
              <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} size={22} tintColor={colors.text} />
            </Pressable>
          </View>

          <AppText variant="title2">The story</AppText>
          <AppText color={colors.textSecondary}>{story.description}</AppText>

          <View style={styles.meta}>
            <Meta label="Format" value={story.runtimeLabel} />
            <Meta label="Language" value="English" />
            <Meta label="Captions" value={story.captionsAvailable ? 'Available' : story.videoSource ? 'Not yet' : 'On release'} />
          </View>

          <View style={styles.notice}>
            <SymbolView name="checkmark.seal.fill" size={19} tintColor={colors.accent} />
            <AppText variant="caption" color={colors.textSecondary} style={styles.grow}>
              Made with generative tools, then reviewed before release.
            </AppText>
          </View>

          <AppText variant="title2">{isPreview ? 'Now playing' : 'Latest episode'}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${story.locked ? 'Open unlock options for' : 'Open'} ${playableLabel}, ${story.episodeTitle}`}
            onPress={openEpisode}
            style={({ pressed }) => [styles.episode, pressed && styles.pressed]}
          >
            <View style={styles.epNumber}><AppText variant="label">{story.episode}</AppText></View>
            <View style={styles.grow}>
              <AppText variant="label">{story.episodeTitle}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{story.locked ? 'View unlock options' : !story.videoSource ? 'Coming soon · voting open' : isPreview ? progress?.completed ? `Play the ${playableLabel} again` : progress?.positionSeconds ? `Continue the ${playableLabel}` : story.runtimeLabel : progress?.completed ? 'Watch again' : progress?.positionSeconds ? 'Continue watching' : 'Watch now'}</AppText>
            </View>
            <SymbolView name={story.locked ? 'lock.fill' : 'play.circle.fill'} size={story.locked ? 16 : 25} tintColor={story.locked ? colors.textMuted : colors.text} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <AppText variant="caption" color={colors.textMuted}>{label}</AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  grow: { flex: 1 },
  pressed: { opacity: .68 },
  missing: { flex: 1, padding: space.xxxl, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: colors.canvas },
  missingText: { textAlign: 'center' },
  scroll: { paddingBottom: 48 },
  hero: { height: 430, backgroundColor: colors.surface },
  top: { position: 'absolute', top: 0, left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  circle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(8,7,10,.64)', alignItems: 'center', justifyContent: 'center' },
  content: { marginTop: -106, paddingHorizontal: space.lg, gap: space.lg },
  upper: { letterSpacing: 1.2, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  save: { width: 52, height: 52, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', gap: space.sm },
  metaItem: { flex: 1, minHeight: 70, padding: space.md, justifyContent: 'center', borderRadius: radius.control, backgroundColor: colors.surface },
  notice: { padding: space.lg, borderRadius: radius.card, backgroundColor: '#201B2B', flexDirection: 'row', gap: space.md },
  episode: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  epNumber: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
