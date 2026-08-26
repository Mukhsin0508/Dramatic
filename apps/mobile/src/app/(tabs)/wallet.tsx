import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from '@/components/symbol-view';

import { PaywallSheet, type PaywallProduct } from '@/components/experience-sheets';
import { AppText, Header, Screen } from '@/components/primitives';
import { colors, radius, space } from '@/constants/tokens';

const PASS_PRODUCT: PaywallProduct = {
  kind: 'pass',
  title: 'Weekly Pass',
  price: '$9.99 / week',
  description: 'Watch every available episode without unlocking them one at a time.',
  highlights: ['Every available episode', 'No coin-by-coin unlocks', 'Cancel before the next renewal'],
};

const TWIST_PRODUCT: PaywallProduct = {
  kind: 'twists',
  title: '3 twist credits',
  price: '$2.99',
  description: 'Give a cliffhanger vote extra weight or send the writers a wild-card idea.',
  highlights: ['Three credits', 'Use on any active story vote', 'Credits do not expire'],
};

const COIN_PACKS: PaywallProduct[] = [
  {
    kind: 'coins',
    title: '100 coins',
    price: '$1.49',
    description: 'A small pack for unlocking episodes one at a time.',
    highlights: ['100 coins', 'About 5 episode unlocks', 'Coins do not expire'],
  },
  {
    kind: 'coins',
    title: '330 coins',
    price: '$4.99',
    description: '300 coins plus 30 bonus coins for your next episodes.',
    highlights: ['300 coins + 30 bonus', 'About 16 episode unlocks', 'Coins do not expire'],
  },
  {
    kind: 'coins',
    title: '800 coins',
    price: '$11.99',
    description: '700 coins plus 100 bonus coins for longer story binges.',
    highlights: ['700 coins + 100 bonus', 'About 40 episode unlocks', 'Coins do not expire'],
  },
];

export default function WalletScreen() {
  const [selectedProduct, setSelectedProduct] = useState<PaywallProduct | null>(null);

  return (
    <Screen>
      <Header eyebrow="Preview store" title="Wallet" />

      <View style={styles.balanceCard}>
        <View style={styles.balanceCopy}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.uppercase}>Coin balance</AppText>
          <AppText style={styles.balance}>—</AppText>
          <AppText color={colors.textSecondary}>Your balance will appear here when purchases are available.</AppText>
        </View>
        <View accessibilityLabel="Balance preview" style={styles.coin}>
          <AppText variant="title1" color={colors.textInverse}>D</AppText>
        </View>
      </View>

      <View accessibilityRole="alert" style={styles.previewNotice}>
        <SymbolView name="lock.shield" size={19} tintColor={colors.warning} />
        <View style={styles.flex}>
          <AppText variant="label">Payments are off in this preview</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Explore each offer below. Nothing will be charged and your balance will not change.</AppText>
        </View>
      </View>

      <ProductCard product={PASS_PRODUCT} icon="play.fill" featured onPress={() => setSelectedProduct(PASS_PRODUCT)} />
      <ProductCard product={TWIST_PRODUCT} icon="arrow.triangle.branch" onPress={() => setSelectedProduct(TWIST_PRODUCT)} />

      <View style={styles.sectionHeading}>
        <AppText variant="title2">Coin packs</AppText>
        <AppText variant="caption" color={colors.textMuted}>Preview prices · Final price shown before purchase</AppText>
      </View>

      <View style={styles.packList}>
        {COIN_PACKS.map((product, index) => (
          <Pressable
            key={product.title}
            accessibilityRole="button"
            accessibilityLabel={`${product.title}, preview price ${product.price}`}
            accessibilityHint="Shows what is included. Purchases are not available in this preview."
            onPress={() => setSelectedProduct(product)}
            style={({ pressed }) => [styles.pack, index < COIN_PACKS.length - 1 && styles.packDivider, pressed && styles.pressed]}
          >
            <View style={styles.miniCoin}><AppText variant="label" color={colors.textInverse}>D</AppText></View>
            <View style={styles.flex}>
              <AppText variant="label">{product.title}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{product.highlights[0]}</AppText>
            </View>
            <View style={styles.priceColumn}>
              <AppText variant="label">{product.price}</AppText>
              <AppText variant="caption" color={colors.textMuted}>Preview</AppText>
            </View>
            <SymbolView name="chevron.right" size={17} tintColor={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <AppText variant="caption" color={colors.textMuted} style={styles.disclaimer}>
        Purchase history and restore controls will appear here once secure checkout is available.
      </AppText>

      <PaywallSheet visible={selectedProduct !== null} product={selectedProduct ?? PASS_PRODUCT} onClose={() => setSelectedProduct(null)} />
    </Screen>
  );
}

function ProductCard({ product, icon, featured = false, onPress }: {
  product: PaywallProduct;
  icon: React.ComponentProps<typeof SymbolView>['name'];
  featured?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, preview price ${product.price}`}
      accessibilityHint="Shows what is included. Purchases are not available in this preview."
      onPress={onPress}
      style={({ pressed }) => [styles.productCard, featured && styles.productFeatured, pressed && styles.pressed]}
    >
      <View style={[styles.productIcon, featured && styles.productIconFeatured]}>
        <SymbolView name={icon} size={21} tintColor={featured ? colors.textInverse : colors.text} />
      </View>
      <View style={styles.flex}>
        <View style={styles.productTitleRow}>
          <AppText variant="title2" style={styles.flex}>{product.title}</AppText>
          <AppText variant="label">{product.price}</AppText>
        </View>
        <AppText color={colors.textSecondary}>{product.description}</AppText>
      </View>
      <SymbolView name="chevron.right" size={18} tintColor={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  balanceCard: { minHeight: 156, borderRadius: radius.sheet, padding: space.xxl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  balanceCopy: { flex: 1, gap: 2 },
  uppercase: { letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700' },
  balance: { fontSize: 48, lineHeight: 54, color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  coin: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#FF7894' },
  previewNotice: { minHeight: 72, borderRadius: radius.card, borderWidth: 1, borderColor: '#5A4924', backgroundColor: '#211C11', padding: space.lg, flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  productCard: { minHeight: 104, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  productFeatured: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  productIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  productIconFeatured: { backgroundColor: colors.brand },
  productTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: 2 },
  sectionHeading: { gap: 2 },
  packList: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pack: { minHeight: 76, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md },
  packDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  miniCoin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.warning, alignItems: 'center', justifyContent: 'center' },
  priceColumn: { alignItems: 'flex-end' },
  pressed: { backgroundColor: colors.surfacePressed, opacity: 0.82 },
  disclaimer: { textAlign: 'center', paddingHorizontal: space.lg },
});
