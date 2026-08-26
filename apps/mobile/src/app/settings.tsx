import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { AppText, BottomSheet, Divider, Header, PrimaryButton, Screen } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { CaptionSize, PlaybackQuality, usePreferences } from '@/context/preferences';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

type ChoiceSheet = 'captions' | 'quality' | null;

export default function SettingsScreen() {
  const systemReducedMotion = useReducedMotion();
  const preferences = usePreferences();
  const [sheet, setSheet] = useState<ChoiceSheet>(null);

  return (
    <>
      <Screen>
        <Header
          eyebrow="Playback and alerts"
          title="Settings"
          action={<Pressable accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={8} onPress={() => router.back()} style={styles.headerButton}><SymbolView name="xmark" size={20} tintColor={colors.text} /></Pressable>}
        />
        <SettingsSection title="Watching">
          <ToggleRow icon="play.fill" label="Autoplay videos" detail="Starts an available video when you swipe to it" value={preferences.autoplay} onValueChange={preferences.setAutoplay} />
          <Divider />
          <ToggleRow icon="captions.bubble.fill" label="Captions" detail="Show English captions by default" value={preferences.captions} onValueChange={preferences.setCaptions} />
          <Divider />
          <ChoiceRow icon="textformat.size" label="Caption size" value={preferences.captionSize} onPress={() => setSheet('captions')} />
          <Divider />
          <ChoiceRow icon="gauge.with.dots.needle.67percent" label="Playback quality" value={preferences.playbackQuality} onPress={() => setSheet('quality')} />
          <Divider />
          <ToggleRow icon="antenna.radiowaves.left.and.right" label="Use less mobile data" detail="Prefer smaller video files on cellular" value={preferences.dataSaver} onValueChange={preferences.setDataSaver} />
        </SettingsSection>
        <SettingsSection title="Notifications">
          <ToggleRow icon="bell.fill" label="New episode alerts" detail="One alert when a story you watch continues" value={preferences.episodeAlerts} onValueChange={preferences.setEpisodeAlerts} />
        </SettingsSection>
        <View style={styles.systemNote}>
          <SymbolView name="figure.wave" size={20} tintColor={colors.accent} />
          <View style={styles.grow}>
            <AppText variant="label">Motion follows your phone</AppText>
            <AppText variant="caption" color={colors.textSecondary}>Reduce Motion is {systemReducedMotion ? 'on' : 'off'} in iOS. Dramatic respects that setting automatically.</AppText>
          </View>
        </View>
        <AppText variant="caption" color={colors.textMuted} style={styles.footnote}>Preferences are kept for this app session while account sync is being built.</AppText>
      </Screen>

      <BottomSheet visible={sheet === 'captions'} onClose={() => setSheet(null)} title="Caption size">
        <ChoiceList
          choices={['Small', 'Standard', 'Large'] as const}
          selected={preferences.captionSize}
          onSelect={(value) => { preferences.setCaptionSize(value as CaptionSize); setSheet(null); }}
        />
      </BottomSheet>
      <BottomSheet visible={sheet === 'quality'} onClose={() => setSheet(null)} title="Playback quality">
        <AppText color={colors.textSecondary} style={styles.sheetIntro}>Automatic balances clarity and loading speed. Data saver uses the least bandwidth.</AppText>
        <ChoiceList
          choices={['Automatic', 'Data saver', 'Highest available'] as const}
          selected={preferences.playbackQuality}
          onSelect={(value) => { preferences.setPlaybackQuality(value as PlaybackQuality); setSheet(null); }}
        />
        <PrimaryButton label="Done" variant="surface" onPress={() => setSheet(null)} />
      </BottomSheet>
    </>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.sectionWrap}><AppText variant="caption" color={colors.textMuted} style={styles.sectionTitle}>{title.toUpperCase()}</AppText><View style={styles.section}>{children}</View></View>;
}

function ToggleRow({ icon, label, detail, value, onValueChange }: { icon: React.ComponentProps<typeof SymbolView>['name']; label: string; detail: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowIcon}><SymbolView name={icon} size={19} tintColor={colors.textSecondary} /></View><View style={styles.grow}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textMuted}>{detail}</AppText></View><Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.text} /></View>;
}

function ChoiceRow({ icon, label, value, onPress }: { icon: React.ComponentProps<typeof SymbolView>['name']; label: string; value: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} accessibilityHint="Opens choices" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={styles.rowIcon}><SymbolView name={icon} size={19} tintColor={colors.textSecondary} /></View><View style={styles.grow}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textMuted}>{value}</AppText></View><SymbolView name="chevron.right" size={17} tintColor={colors.textMuted} /></Pressable>;
}

function ChoiceList<T extends string>({ choices, selected, onSelect }: { choices: readonly T[]; selected: T; onSelect: (choice: T) => void }) {
  return <View accessibilityRole="radiogroup" style={styles.choices}>{choices.map(choice => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: choice === selected }} onPress={() => onSelect(choice)} style={({ pressed }) => [styles.choice, choice === selected && styles.choiceSelected, pressed && styles.pressed]}><AppText variant="label" style={styles.grow}>{choice}</AppText>{choice === selected ? <SymbolView name="checkmark.circle.fill" size={22} tintColor={colors.brand} /> : <View style={styles.emptyCheck} />}</Pressable>)}</View>;
}

const styles = StyleSheet.create({
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  grow: { flex: 1 },
  sectionWrap: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs, letterSpacing: 1, fontWeight: '700' },
  section: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: space.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  row: { minHeight: 72, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: .68 },
  systemNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: '#201B2B', borderWidth: 1, borderColor: '#3F3552' },
  footnote: { textAlign: 'center', paddingHorizontal: space.xl },
  sheetIntro: { marginBottom: space.lg },
  choices: { gap: space.sm, marginBottom: space.xl },
  choice: { minHeight: 56, paddingHorizontal: space.lg, borderRadius: radius.control, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: 'transparent' },
  choiceSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  emptyCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
});
