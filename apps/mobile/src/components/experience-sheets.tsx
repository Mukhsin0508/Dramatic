import { useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { BottomSheet, AppText, PrimaryButton } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';
import { haptics } from '@/lib/haptics';

export function VoteSheet({ visible, question, choices, selectedChoice, onSelect, onClose }: {
  visible: boolean;
  question: string;
  choices: readonly string[];
  selectedChoice?: string;
  onSelect: (choice: string) => void;
  onClose: () => void;
}) {
  const choice = selectedChoice ?? null;
  const select = (value: string) => {
    onSelect(value);
    haptics.selection();
    AccessibilityInfo.announceForAccessibility(`${value} selected and saved on this device.`);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Your call">
      <View accessibilityRole="radiogroup" accessibilityLabel={question} style={styles.sheetStack}>
        <AppText color={colors.textSecondary}>{question}</AppText>
        {choices.map(item => {
          const selected = choice === item;
          return (
            <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => select(item)} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && { opacity: .75 }]}>
              <View style={styles.choiceLine}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <SymbolView name="checkmark" size={13} tintColor={colors.textInverse} /> : null}</View><AppText variant="label" style={styles.flex}>{item}</AppText></View>
            </Pressable>
          );
        })}
        {choice ? <View style={styles.resultNote}><SymbolView name="checkmark.circle.fill" size={17} tintColor={colors.accent} /><AppText variant="caption" color={colors.textSecondary}>Your choice is saved on this device. You can change it here.</AppText></View> : null}
        <PrimaryButton label={choice ? 'Done' : 'Not voting now'} variant={choice ? 'brand' : 'ghost'} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

export type PaywallProduct = {
  kind: 'pass' | 'coins' | 'twists';
  title: string;
  price: string;
  description: string;
  highlights: readonly string[];
};

type PaywallSheetProps = {
  visible: boolean;
  offline?: boolean;
  episodeNumber?: number;
  onClose: () => void;
  product?: PaywallProduct;
};

export function PaywallSheet(props: PaywallSheetProps) {
  const { visible, offline = false, episodeNumber, onClose, product } = props;
  const [selectedOption, setSelectedOption] = useState<'pass' | 'coins'>('pass');

  const selectOption = (option: 'pass' | 'coins') => {
    setSelectedOption(option);
    haptics.selection();
  };

  if (product) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title={product.title}>
        <View style={styles.sheetStack}>
          <View style={styles.productHero}>
            <View style={styles.productIcon}>
              <SymbolView name={productIcon(product.kind)} size={24} tintColor={colors.textInverse} />
            </View>
            <View style={styles.flex}>
              <AppText variant="caption" color={colors.brand} style={styles.uppercase}>Offer preview</AppText>
              <AppText variant="title1">{product.price}</AppText>
            </View>
          </View>
          <AppText color={colors.textSecondary}>{product.description}</AppText>
          <View style={styles.highlightList}>
            {product.highlights.map(highlight => (
              <View key={highlight} style={styles.highlightRow}>
                <View style={styles.checkDisc}><SymbolView name="checkmark" size={12} tintColor={colors.textInverse} /></View>
                <AppText style={styles.flex}>{highlight}</AppText>
              </View>
            ))}
          </View>
          <PreviewNotice offline={offline} />
          <PrimaryButton label="Purchase unavailable" disabled onPress={() => undefined} />
          <PrimaryButton label="Done" variant="ghost" onPress={onClose} />
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Unlock options">
      <View style={styles.sheetStack}>
        <AppText color={colors.textSecondary}>
          {episodeNumber ? `Choose how you’d like to unlock Episode ${episodeNumber} when purchases become available.` : 'Choose how you’d like to keep watching when purchases become available.'}
        </AppText>

        <View accessibilityRole="radiogroup" accessibilityLabel="Unlock options" style={styles.optionList}>
          <OfferOption title="Weekly Pass" subtitle="Every available episode" price="$9.99 / week" selected={selectedOption === 'pass'} onPress={() => selectOption('pass')} />
          {episodeNumber ? <OfferOption title="Unlock with coins" subtitle="20 coins for this episode" price="20 coins" selected={selectedOption === 'coins'} onPress={() => selectOption('coins')} /> : null}
        </View>

        <PreviewNotice offline={offline} />
        <PrimaryButton label="Checkout coming soon" disabled onPress={() => undefined} />
        <AppText variant="caption" color={colors.textMuted} style={styles.center}>
          Weekly Pass pricing is a preview. You’ll see the final price and renewal terms before any purchase.
        </AppText>
        <PrimaryButton label="Not now" variant="ghost" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

function OfferOption({ title, subtitle, price, selected, onPress }: { title: string; subtitle: string; price: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.offerOption, selected && styles.offerOptionSelected, pressed && styles.optionPressed]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <SymbolView name="checkmark" size={13} tintColor={colors.textInverse} /> : null}
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>{subtitle}</AppText>
      </View>
      <AppText variant="label">{price}</AppText>
    </Pressable>
  );
}

function PreviewNotice({ offline }: { offline: boolean }) {
  return (
    <View accessibilityRole="alert" style={[styles.notice, offline && styles.noticeOffline]}>
      <SymbolView name={offline ? 'wifi.slash' : 'lock.shield'} size={18} tintColor={colors.warning} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.flex}>
        {offline ? 'You’re offline, and purchases are not available in this preview. Nothing will be charged.' : 'Purchases are not available in this preview. Nothing will be charged or unlocked.'}
      </AppText>
    </View>
  );
}

function productIcon(kind: PaywallProduct['kind']): React.ComponentProps<typeof SymbolView>['name'] {
  if (kind === 'coins') return 'dollarsign.circle.fill';
  if (kind === 'twists') return 'arrow.triangle.branch';
  return 'play.fill';
}

const styles = StyleSheet.create({
  sheetStack: { gap: space.md, paddingBottom: space.xl },
  flex: { flex: 1 },
  choice: { minHeight: 60, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: radius.control, padding: space.lg, overflow: 'hidden' },
  choiceSelected: { borderColor: colors.brand },
  choiceLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  resultNote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  productHero: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.md },
  productIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  uppercase: { textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  highlightList: { gap: space.md, paddingVertical: space.sm },
  highlightRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkDisc: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  optionList: { gap: space.sm },
  offerOption: { minHeight: 72, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: radius.control, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  offerOptionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  optionPressed: { opacity: 0.78 },
  notice: { minHeight: 60, borderRadius: radius.control, borderWidth: 1, borderColor: '#5A4924', backgroundColor: '#211C11', flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm },
  noticeOffline: { backgroundColor: '#241B14' },
  center: { textAlign: 'center', paddingHorizontal: space.md },
});
