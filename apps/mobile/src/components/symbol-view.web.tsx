import { Text } from 'react-native';

import type { SymbolViewProps } from 'expo-symbols';

// expo-symbols has no web implementation, so the browser build swaps each SF
// Symbol for a monochrome text glyph. U+FE0E forces text presentation where a
// glyph would otherwise render as an emoji that ignores tintColor.
const GLYPHS: Record<string, { glyph: string; scale?: number }> = {
  'arrow.triangle.branch': { glyph: '⑂' },
  'arrow.up.right': { glyph: '↗' },
  bookmark: { glyph: '⚐', scale: 0.95 },
  'bookmark.fill': { glyph: '⚑', scale: 0.95 },
  'bubble.left.and.text.bubble.right.fill': { glyph: '💬︎' },
  checkmark: { glyph: '✓' },
  'checkmark.circle.fill': { glyph: '✓' },
  'checkmark.seal.fill': { glyph: '✓' },
  'chevron.left': { glyph: '‹', scale: 1.1 },
  'chevron.left.forwardslash.chevron.right': { glyph: '</>', scale: 0.62 },
  'chevron.right': { glyph: '›', scale: 1.1 },
  'creditcard.fill': { glyph: '▤', scale: 0.95 },
  'dollarsign.circle.fill': { glyph: '$', scale: 0.9 },
  ellipsis: { glyph: '⋯' },
  'figure.wave': { glyph: '✦' },
  'film.stack': { glyph: '⧉' },
  'gearshape.fill': { glyph: '⚙︎' },
  heart: { glyph: '♡', scale: 1.05 },
  'heart.fill': { glyph: '♥', scale: 1.05 },
  'info.circle.fill': { glyph: 'ⓘ' },
  'lock.fill': { glyph: '🔒︎' },
  'lock.shield': { glyph: '🛡︎' },
  magnifyingglass: { glyph: '⌕', scale: 1.1 },
  'person.crop.circle': { glyph: '◔', scale: 0.95 },
  'person.fill': { glyph: '●', scale: 0.8 },
  'play.circle.fill': { glyph: '▶︎', scale: 0.85 },
  'play.fill': { glyph: '▶︎', scale: 0.85 },
  'play.rectangle.fill': { glyph: '▶︎', scale: 0.85 },
  'questionmark.circle.fill': { glyph: '?', scale: 0.9 },
  'square.and.arrow.up': { glyph: '↥', scale: 1.05 },
  'wifi.slash': { glyph: '⌁' },
  xmark: { glyph: '✕', scale: 0.9 },
  'xmark.circle.fill': { glyph: '✕', scale: 0.9 },
};

export type { SymbolViewProps };

export function SymbolView({ name, size = 24, tintColor }: SymbolViewProps) {
  const entry = GLYPHS[String(name)] ?? { glyph: '●', scale: 0.6 };
  const fontSize = Math.round(size * (entry.scale ?? 1));
  return (
    <Text
      accessible={false}
      style={{
        color: typeof tintColor === 'string' ? tintColor : '#FCF8FC',
        fontSize,
        lineHeight: Math.round(size * 1.05),
        textAlign: 'center',
        includeFontPadding: false,
      }}
    >
      {entry.glyph}
    </Text>
  );
}
