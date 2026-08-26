import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { AppText, Header, LoadingBlock, Screen } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { useExperience } from '@/context/experience';
import { STORIES, Story } from '@/data/stories';

type Collection = 'all' | 'saved' | 'history';

const GENRES = ['All genres', ...Array.from(new Set(STORIES.flatMap(story => story.genres.split(' · '))))];

export default function LibraryScreen() {
  const { hydrated, savedIds, watchProgress } = useExperience();
  const [collection, setCollection] = useState<Collection>('all');
  const [genre, setGenre] = useState('All genres');
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return STORIES.filter(story => {
      if (collection === 'saved' && !savedIds.has(story.id)) return false;
      if (collection === 'history' && !watchProgress[story.episodeId]) return false;
      if (genre !== 'All genres' && !story.genres.split(' · ').includes(genre)) return false;
      if (!normalizedQuery) return true;
      return [story.title, story.episodeTitle, story.synopsis, story.genres]
        .some(value => value.toLocaleLowerCase().includes(normalizedQuery));
    }).sort((first, second) => collection === 'history'
      ? (watchProgress[second.episodeId]?.updatedAt ?? 0) - (watchProgress[first.episodeId]?.updatedAt ?? 0)
      : 0);
  }, [collection, genre, query, savedIds, watchProgress]);

  const continueStory = useMemo(() => STORIES
    .filter(story => watchProgress[story.episodeId] && !watchProgress[story.episodeId].completed)
    .sort((first, second) => watchProgress[second.episodeId].updatedAt - watchProgress[first.episodeId].updatedAt)[0], [watchProgress]);
  const historyCount = STORIES.filter(story => watchProgress[story.episodeId]).length;

  const isDefaultView = collection === 'all' && genre === 'All genres' && query.trim() === '';
  const clearFilters = () => { setCollection('all'); setGenre('All genres'); setQuery(''); };

  return (
    <Screen>
      <Header eyebrow="Pick up where you left off" title="Library" />

      {!hydrated ? <LoadingBlock label="Loading your Library" /> : <>

      <View style={styles.searchField}>
        <SymbolView name="magnifyingglass" size={19} tintColor={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search your Library"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="never"
          onChangeText={setQuery}
          placeholder="Search stories, episodes, or genres"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          selectionColor={colors.brand}
          style={styles.searchInput}
          value={query}
        />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery('')} style={styles.clearSearch}><SymbolView name="xmark.circle.fill" size={20} tintColor={colors.textMuted} /></Pressable> : null}
      </View>

      {isDefaultView && continueStory ? <>
        <View style={styles.sectionTitle}><AppText variant="title2">Continue watching</AppText><AppText variant="caption" color={colors.textMuted}>Episode {continueStory.episode}</AppText></View>
        <ContinueCard story={continueStory} progress={watchProgress[continueStory.episodeId]} />
      </> : null}

      <View accessibilityRole="tablist" accessibilityLabel="Library collections" style={styles.segment}>
        <Segment label="All" count={STORIES.length} selected={collection === 'all'} onPress={() => setCollection('all')} />
        <Segment label="Saved" count={savedIds.size} selected={collection === 'saved'} onPress={() => setCollection('saved')} />
        <Segment label="History" count={historyCount} selected={collection === 'history'} onPress={() => setCollection('history')} />
      </View>

      <View style={styles.filterBlock}>
        <View style={styles.filterHeading}>
          <AppText variant="label">Genre</AppText>
          {(genre !== 'All genres' || collection !== 'all' || query) ? <Pressable accessibilityRole="button" accessibilityLabel="Clear all Library filters" onPress={clearFilters} hitSlop={8}><AppText variant="label" color={colors.brand}>Reset</AppText></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {GENRES.map(item => <GenreChip key={item} label={titleCase(item)} selected={genre === item} onPress={() => setGenre(item)} />)}
        </ScrollView>
      </View>

      <View style={styles.resultsHeading}>
        <AppText variant="title2">{collection === 'saved' ? 'Saved stories' : collection === 'history' ? 'Watch history' : 'All stories'}</AppText>
        <AppText variant="caption" color={colors.textMuted}>{results.length} {results.length === 1 ? 'result' : 'results'}</AppText>
      </View>

      {results.length ? <View style={styles.grid}>
        {results.map(story => <PosterCard key={story.id} story={story} saved={savedIds.has(story.id)} progress={watchProgress[story.episodeId]} />)}
      </View> : <EmptyResults onClear={clearFilters} />}
      </>}
    </Screen>
  );
}

function ContinueCard({ story, progress }: { story: Story; progress: { positionSeconds: number; durationSeconds: number } }) {
  const watched = progress.durationSeconds > 0 ? Math.min(progress.positionSeconds / progress.durationSeconds, 1) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Continue ${story.title}, episode ${story.episode}`} onPress={() => router.push({ pathname: '/(tabs)/watch', params: { story: story.id } })} style={({ pressed }) => [styles.continueCard, pressed && styles.pressed]}>
      <Image source={story.poster} style={styles.continueImage} contentFit="cover" />
      <View style={styles.continueCopy}>
        <AppText variant="caption" color={colors.brand} style={styles.upper}>Episode {story.episode} of {story.episodeCount}</AppText>
        <AppText variant="title2" numberOfLines={1}>{story.title}</AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>{story.episodeTitle}</AppText>
        <View accessibilityRole="progressbar" accessibilityLabel={`${Math.round(watched * 100)} percent watched`} style={styles.progressTrack}><View style={[styles.progress, { width: `${watched * 100}%` }]} /></View>
      </View>
      <View style={styles.play}><SymbolView name="play.fill" size={18} tintColor={colors.textInverse} /></View>
    </Pressable>
  );
}

function Segment({ label, count, selected, onPress }: { label: string; count: number; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="tab" accessibilityLabel={`${label}, ${count}`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.segmentItem, selected && styles.segmentSelected, pressed && styles.pressed]}><AppText variant="label" color={selected ? colors.text : colors.textMuted}>{label}</AppText><AppText variant="caption" color={selected ? colors.brand : colors.textMuted}>{count}</AppText></Pressable>;
}

function GenreChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}><AppText variant="caption" color={selected ? colors.text : colors.textSecondary} style={styles.chipLabel}>{label}</AppText></Pressable>;
}

function PosterCard({ story, saved, progress }: { story: Story; saved: boolean; progress?: { positionSeconds: number; durationSeconds: number; completed: boolean } }) {
  const watched = progress && progress.durationSeconds > 0 ? Math.min(progress.positionSeconds / progress.durationSeconds, 1) : 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${story.title}, ${story.episodeCount} episodes${saved ? ', saved' : ''}`} onPress={() => router.push({ pathname: '/story/[id]', params: { id: story.id } })} style={({ pressed }) => [styles.posterCard, pressed && styles.pressed]}>
      <Image source={story.poster} style={styles.posterImage} contentFit="cover" />
      {saved ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.savedBadge}><SymbolView name="bookmark.fill" size={13} tintColor={colors.text} /></View> : null}
      <AppText variant="label" numberOfLines={1} style={styles.posterTitle}>{story.title}</AppText>
      <AppText variant="caption" color={colors.textMuted}>Episode {story.episode} · {progress?.completed ? 'Watched' : watched > 0 ? `${Math.round(watched * 100)}% watched` : 'Not started'}</AppText>
    </Pressable>
  );
}

function EmptyResults({ onClear }: { onClear: () => void }) {
  return <View accessibilityRole="summary" style={styles.empty}><View style={styles.emptyIcon}><SymbolView name="magnifyingglass" size={25} tintColor={colors.textSecondary} /></View><AppText variant="title2">Nothing matches yet</AppText><AppText color={colors.textSecondary} style={styles.emptyCopy}>Try another title or clear the collection and genre filters.</AppText><Pressable accessibilityRole="button" onPress={onClear} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><AppText variant="label">Clear filters</AppText></Pressable></View>;
}

function titleCase(value: string) {
  return value.toLocaleLowerCase().replace(/(^|\s)\S/g, character => character.toLocaleUpperCase());
}

const styles = StyleSheet.create({
  pressed: { opacity: .68 },
  searchField: { minHeight: 52, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.control, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, minHeight: 50, paddingVertical: 0, color: colors.text, fontSize: 16, lineHeight: 22 },
  clearSearch: { width: 44, height: 44, marginRight: -space.md, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  continueCard: { minHeight: 126, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md },
  continueImage: { width: 76, height: 102, borderRadius: radius.control, backgroundColor: colors.surfaceRaised },
  continueCopy: { flex: 1, gap: 2 },
  upper: { textTransform: 'uppercase', letterSpacing: .7, fontWeight: '700' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.border, marginTop: space.md },
  progress: { height: 4, backgroundColor: colors.brand },
  segment: { minHeight: 54, borderRadius: radius.control, backgroundColor: colors.surface, padding: 4, flexDirection: 'row', borderWidth: 1, borderColor: colors.border },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: radius.sm, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.surfaceRaised },
  filterBlock: { gap: space.sm },
  filterHeading: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { gap: space.sm, paddingRight: space.lg },
  chip: { minHeight: 44, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipLabel: { fontWeight: '600' },
  resultsHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  posterCard: { width: '47%', flexGrow: 1, maxWidth: '50%' },
  posterImage: { width: '100%', aspectRatio: .72, borderRadius: radius.card, backgroundColor: colors.surface },
  savedBadge: { position: 'absolute', top: space.sm, right: space.sm, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(8,7,10,.7)', alignItems: 'center', justifyContent: 'center' },
  posterTitle: { marginTop: space.sm },
  empty: { minHeight: 260, padding: space.xxl, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, marginBottom: space.xs },
  emptyCopy: { textAlign: 'center' },
  emptyButton: { minHeight: 48, marginTop: space.sm, paddingHorizontal: space.xl, borderRadius: radius.control, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
});
