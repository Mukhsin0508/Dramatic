export const colors = {
  ink: "#09090B",
  surface: "#121216",
  surfaceRaised: "#1B1B22",
  line: "#2D2D37",
  paper: "#FAFAFA",
  muted: "#A1A1AA",
  dramatic: "#FF375F",
  dramaticPressed: "#D91F49",
  electric: "#8B5CF6",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#FB7185",
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const typography = {
  display: { fontSize: 48, lineHeight: 52, fontWeight: "800" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "750" },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "650" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const;

export const motion = {
  duration: { fast: 120, normal: 220, deliberate: 360 },
  easing: { standard: [0.2, 0, 0, 1], emphasized: [0.2, 0, 0, 1.2] },
} as const;

export const layout = { contentMaxWidth: 1200, mobileGutter: 20, videoAspectRatio: 9 / 16 } as const;

export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
