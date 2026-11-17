// YoChef design tokens (Revamped Phase 2.1). Modern Culinary Editorial theme.
// Text/background pairs meet WCAG AA (4.5:1) for body text and interactive states.

export const colors = {
  background: '#FAFAF9', // crisp, elegant modern canvas
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F5',
  surfaceSubtle: '#F9FAFB',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderStrong: '#D1D5DB',

  text: '#111827', // dark slate for high contrast typography
  textSecondary: '#4B5563',
  textMuted: '#52525B', // >= 4.5:1 on background
  textInverse: '#FFFFFF',
  textOnPrimary: '#FFFFFF',

  // Accessible warm culinary accent (meets WCAG AA >= 4.5:1 on white and background)
  primary: '#CC3A00',
  primaryBright: '#FF5E36', // Coral accent for visual graphics / badges
  primaryPressed: '#B33300',
  primarySoft: '#FFF1ED',
  primaryLight: '#FFF1ED',
  primaryDark: '#B33300',

  // Slate accents
  dark: '#111827',
  secondary: '#374151',
  secondaryLight: '#F3F4F6',

  // Status & Highlights
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  error: '#EF4444',
  success: '#047857',
  successSoft: '#D1FAE5',
  info: '#1D4ED8',
  infoSoft: '#DBEAFE',
  warning: '#D97706',
  star: '#F59E0B',
  gold: '#F59E0B',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 6,
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  card: 20,
  pill: 999,
  full: 9999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

export type TextVariant = keyof typeof typography;

export const shadows = {
  none: {},
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  glow: {
    shadowColor: '#FF5E36',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
} as const;

// Minimum touch target (Apple HIG 44pt, Material 48dp).
export const touchTarget = 48;

export const theme = { colors, spacing, radius, typography, shadows, touchTarget } as const;
export type Theme = typeof theme;
