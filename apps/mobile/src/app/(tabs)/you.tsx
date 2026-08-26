import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { AppText, Divider, Header, Screen } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { useExperience } from '@/context/experience';
import { usePreferences } from '@/context/preferences';
import { STORIES } from '@/data/stories';

const REPO_URL = 'https://github.com/Mukhsin0508/Dramatic';

export default function YouScreen() {
  const preferences = usePreferences();
  const { savedIds, voteChoices, watchProgress } = useExperience();
  const watchingCount = STORIES.filter(story => watchProgress[story.episodeId]).length;
  const choiceCount = Object.keys(voteChoices).length;

  return (
    <Screen>
      <Header
        eyebrow="Your Dramatic"
        title="You"
        action={<Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('../settings')} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}><SymbolView name="gearshape.fill" size={21} tintColor={colors.text} /></Pressable>}
      />

      <View style={styles.guestCard}>
        <View style={styles.avatar}><SymbolView name="person.fill" size={25} tintColor={colors.textInverse} /></View>
        <View style={styles.grow}>
          <AppText variant="title2">Watching as a guest</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Your saved stories, progress, and choices stay on this device.</AppText>
        </View>
        <View accessibilityLabel="Guest account" style={styles.guestBadge}><AppText variant="caption" color={colors.accent}>GUEST</AppText></View>
      </View>

      <View style={styles.activity}>
        <ActivityStat value={String(watchingCount)} label="Watching" />
        <View style={styles.verticalDivider} />
        <ActivityStat value={String(savedIds.size)} label="Saved" />
        <View style={styles.verticalDivider} />
        <ActivityStat value={String(choiceCount)} label={choiceCount === 1 ? 'Choice made' : 'Choices made'} />
      </View>

      <View style={styles.preferenceCard}>
        <View style={styles.preferenceIcon}><SymbolView name="play.rectangle.fill" size={21} tintColor={colors.brand} /></View>
        <View style={styles.grow}>
          <AppText variant="label">Your watching setup</AppText>
          <AppText variant="caption" color={colors.textSecondary}>{preferences.captions ? `${preferences.captionSize} captions` : 'Captions off'} · {preferences.playbackQuality}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Change watching settings" onPress={() => router.push('../settings')} hitSlop={8} style={({ pressed }) => [styles.changeButton, pressed && styles.pressed]}><AppText variant="label" color={colors.brand}>Change</AppText></Pressable>
      </View>

      <View style={styles.sectionWrap}>
        <AppText variant="caption" color={colors.textMuted} style={styles.sectionTitle}>SUPPORT</AppText>
        <View style={styles.section}>
          <ExternalRow icon="questionmark.circle.fill" label="Help and project guide" url={`${REPO_URL}#readme`} />
          <Divider />
          <ExternalRow icon="bubble.left.and.text.bubble.right.fill" label="Send feedback" url={`${REPO_URL}/issues/new`} />
          <Divider />
          <ExternalRow icon="info.circle.fill" label="How stories are made" url={`${REPO_URL}#architecture`} />
        </View>
      </View>

      <View style={styles.syncNote}>
        <SymbolView name="person.crop.circle" size={20} tintColor={colors.accent} />
        <View style={styles.grow}>
          <AppText variant="label">Account sync is coming later</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Sign in will add cross-device sync later. Your local watching data already works without it.</AppText>
        </View>
      </View>

      <Pressable accessibilityRole="link" accessibilityLabel="Open the Dramatic source code" accessibilityHint="Opens GitHub in your browser" onPress={() => { void Linking.openURL(REPO_URL); }} style={({ pressed }) => [styles.repoLink, pressed && styles.pressed]}>
        <SymbolView name="chevron.left.forwardslash.chevron.right" size={18} tintColor={colors.textSecondary} />
        <AppText variant="label">View the project on GitHub</AppText>
        <SymbolView name="arrow.up.right" size={16} tintColor={colors.textMuted} />
      </Pressable>
      <AppText variant="caption" color={colors.textMuted} style={styles.version}>Dramatic 1.0 · Built for tomorrow’s episode</AppText>
    </Screen>
  );
}

function ActivityStat({ value, label }: { value: string; label: string }) {
  return <View accessible accessibilityLabel={`${value} ${label}`} style={styles.stat}><AppText variant="title2">{value}</AppText><AppText variant="caption" color={colors.textMuted}>{label}</AppText></View>;
}

function ExternalRow({ icon, label, url }: { icon: React.ComponentProps<typeof SymbolView>['name']; label: string; url: string }) {
  return <Pressable accessibilityRole="link" accessibilityLabel={label} accessibilityHint="Opens GitHub in your browser" onPress={() => { void Linking.openURL(url); }} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={styles.rowIcon}><SymbolView name={icon} size={19} tintColor={colors.textSecondary} /></View><AppText variant="label" style={styles.grow}>{label}</AppText><SymbolView name="arrow.up.right" size={16} tintColor={colors.textMuted} /></Pressable>;
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: .68 },
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  guestCard: { minHeight: 104, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  guestBadge: { borderRadius: radius.pill, backgroundColor: '#2B2235', borderWidth: 1, borderColor: '#493A59', paddingHorizontal: space.sm, paddingVertical: space.xs },
  activity: { minHeight: 82, flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  verticalDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: space.lg, backgroundColor: colors.border },
  preferenceCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: '#602338' },
  preferenceIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  changeButton: { minWidth: 60, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  sectionWrap: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs, letterSpacing: 1, fontWeight: '700' },
  section: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: space.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  syncNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: '#201B2B', borderWidth: 1, borderColor: '#3F3552' },
  repoLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border },
  version: { textAlign: 'center' },
});
