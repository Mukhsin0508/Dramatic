import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol-view';

import { AppText, Header, Screen } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { usePreferences } from '@/context/preferences';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export default function SettingsScreen() {
  const systemReducedMotion = useReducedMotion();
  const preferences = usePreferences();

  return (
    <Screen>
        <Header
          eyebrow="Playback"
          title="Settings"
          action={<Pressable accessibilityRole="button" accessibilityLabel="Close settings" hitSlop={8} onPress={() => router.back()} style={styles.headerButton}><SymbolView name="xmark" size={20} tintColor={colors.text} /></Pressable>}
        />
        <SettingsSection title="Watching">
          <ToggleRow
            icon="play.fill"
            label="Autoplay videos"
            detail={preferences.hydrated ? 'Starts available teasers, cold opens, and episodes when they come into view' : 'Loading your saved preference'}
            value={preferences.autoplay}
            disabled={!preferences.hydrated}
            onValueChange={preferences.setAutoplay}
          />
        </SettingsSection>
        <View style={styles.systemNote}>
          <SymbolView name="figure.wave" size={20} tintColor={colors.accent} />
          <View style={styles.grow}>
            <AppText variant="label">Motion follows your phone</AppText>
            <AppText variant="caption" color={colors.textSecondary}>Reduce Motion is {systemReducedMotion ? 'on' : 'off'} in iOS. Dramatic respects that setting automatically.</AppText>
          </View>
        </View>
        <AppText variant="caption" color={colors.textMuted} style={styles.footnote}>Preferences stay on this device.</AppText>
    </Screen>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.sectionWrap}><AppText variant="caption" color={colors.textMuted} style={styles.sectionTitle}>{title.toUpperCase()}</AppText><View style={styles.section}>{children}</View></View>;
}

function ToggleRow({ icon, label, detail, value, disabled = false, onValueChange }: { icon: React.ComponentProps<typeof SymbolView>['name']; label: string; detail: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.row}><View style={styles.rowIcon}><SymbolView name={icon} size={19} tintColor={colors.textSecondary} /></View><View style={styles.grow}><AppText variant="label">{label}</AppText><AppText variant="caption" color={colors.textMuted}>{detail}</AppText></View><Switch accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.brand }} thumbColor={colors.text} /></View>;
}

const styles = StyleSheet.create({
  headerButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  grow: { flex: 1 },
  sectionWrap: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.xs, letterSpacing: 1, fontWeight: '700' },
  section: { borderRadius: radius.card, backgroundColor: colors.surface, paddingHorizontal: space.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  row: { minHeight: 72, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  systemNote: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: '#201B2B', borderWidth: 1, borderColor: '#3F3552' },
  footnote: { textAlign: 'center', paddingHorizontal: space.xl },
});
