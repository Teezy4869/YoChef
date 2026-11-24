// YoChef design tokens (Phase 1.2). Light theme only (app.json userInterfaceStyle).
// Text/background pairs meet WCAG AA (4.5:1) for body text.

export const colors = {
  background: '#FAF7F2', // warm paper, matches splash and adaptive icon
  surface: '#FFFFFF',
  surfaceMuted: '#F3EDE4',
  border: '#E5DCD0',
  borderStrong: '#C9BCAB',

  text: '#1F1A17',
  textMuted: '#655B53', // 6.2:1 on background
  textOnPrimary: '#FFFFFF',

  primary: '#B93E0C', // 5.6:1 with white text
  primaryPressed: '#962F06',
  primarySoft: '#FBE7DC',

  danger: '#B42318',
  dangerSoft: '#FDECEA',
  success: '#067647',
  successSoft: '#E6F4EC',
  info: '#175CD3',
  infoSoft: '#EAF1FD',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TextVariant = keyof typeof typography;

// Minimum touch target (Apple HIG 44pt, Material 48dp).
export const touchTarget = 48;

export const theme = { colors, spacing, radius, typography, touchTarget } as const;
export type Theme = typeof theme;
