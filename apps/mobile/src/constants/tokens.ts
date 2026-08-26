export const colors = {
  canvas: '#08070A', surface: '#151219', surfaceRaised: '#201C24', surfacePressed: '#2A242F', border: '#37303D',
  text: '#FCF8FC', textSecondary: '#C8C0CC', textMuted: '#9B929F', textInverse: '#19080E',
  brand: '#FF4D73', brandPressed: '#E83A63', brandSoft: '#3A1521', accent: '#C7A8FF',
  success: '#58D99B', warning: '#FFC857', danger: '#FF747D', focus: '#9BD7FF',
  scrimSoft: 'rgba(8,7,10,0.36)', scrimStrong: 'rgba(8,7,10,0.78)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, control: 12, card: 16, sheet: 24, pill: 999 } as const;
export const motion = { fast: 140, standard: 220, emphasized: 320 } as const;
export const typography = {
  display: { fontSize: 32, lineHeight: 37, fontWeight: '700' as const },
  title1: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  title2: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
} as const;
