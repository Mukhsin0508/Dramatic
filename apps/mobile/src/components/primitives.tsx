import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, SymbolViewProps } from 'expo-symbols';

import { colors, radius, space, typography } from '@/constants/tokens';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

type TextVariant = keyof typeof typography;

export function AppText({ children, variant = 'body', color = colors.text, style, numberOfLines }: {
  children: ReactNode; variant?: TextVariant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) {
  return <Text allowFontScaling maxFontSizeMultiplier={2} numberOfLines={numberOfLines} style={[typography[variant], { color }, style]}>{children}</Text>;
}

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const content = <View style={[styles.screenContent, style]}>{children}</View>;
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

export function Header({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <View style={styles.header}><View style={styles.grow}>{eyebrow ? <AppText variant="caption" color={colors.brand} style={styles.eyebrow}>{eyebrow}</AppText> : null}<AppText variant="display">{title}</AppText></View>{action}</View>;
}

export function PrimaryButton({ label, onPress, variant = 'brand', disabled = false, icon }: {
  label: string; onPress: () => void; variant?: 'brand' | 'surface' | 'ghost' | 'danger'; disabled?: boolean; icon?: SymbolViewProps['name'];
}) {
  const fill = variant === 'brand' ? colors.brand : variant === 'danger' ? colors.danger : variant === 'surface' ? colors.surfaceRaised : 'transparent';
  const foreground = variant === 'brand' || variant === 'danger' ? colors.textInverse : colors.text;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: fill, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }]}>
      {icon ? <SymbolView name={icon} size={19} tintColor={foreground} /> : null}
      <AppText variant="label" color={foreground}>{label}</AppText>
    </Pressable>
  );
}

export function IconButton({ name, label, onPress, selected = false, count }: {
  name: SymbolViewProps['name']; label: string; onPress: () => void; selected?: boolean; count?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <View style={[styles.iconDisc, selected && styles.iconSelected]}><SymbolView name={name} size={24} tintColor={selected ? colors.brand : colors.text} /></View>
      {count ? <AppText variant="caption" style={styles.iconCount}>{count}</AppText> : null}
    </Pressable>
  );
}

export function Divider() { return <View style={styles.divider} />; }

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.loading}><ActivityIndicator color={colors.brand} /><AppText color={colors.textSecondary}>{label}</AppText></View>;
}

export function BottomSheet({ visible, onClose, children, title }: { visible: boolean; onClose: () => void; children: ReactNode; title: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <Modal transparent visible={visible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable accessible={false} importantForAccessibility="no" style={styles.backdrop} onPress={onClose} />
        <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}><AppText variant="title1">{title}</AppText><Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} hitSlop={12} onPress={onClose} style={styles.close}><SymbolView name="xmark" size={19} tintColor={colors.text} /></Pressable></View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>{children}</ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, paddingBottom: 112 },
  screenContent: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  grow: { flex: 1 },
  eyebrow: { letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700', marginBottom: 2 },
  button: { minHeight: 52, borderRadius: radius.control, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: space.sm },
  iconButton: { minWidth: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  iconDisc: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,7,10,0.52)' },
  iconSelected: { backgroundColor: colors.brandSoft },
  iconCount: { marginTop: -2, fontWeight: '600', textShadowColor: 'rgba(0,0,0,.8)', textShadowRadius: 3 },
  pressed: { opacity: 0.65 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  loading: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: space.md },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,.68)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.lg, paddingBottom: space.sm, maxHeight: '90%' },
  sheetScroll: { flexGrow: 0 },
  grabber: { width: 38, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, alignSelf: 'center', marginTop: space.sm, marginBottom: space.lg },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xl },
  close: { marginLeft: 'auto', width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
});
