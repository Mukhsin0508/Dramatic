// Platform switch for icons: iOS renders real SF Symbols via expo-symbols,
// while symbol-view.web.tsx substitutes text glyphs so the same screens run
// in the browser (expo-symbols has no web implementation).
export { SymbolView } from 'expo-symbols';
export type { SymbolViewProps } from 'expo-symbols';
