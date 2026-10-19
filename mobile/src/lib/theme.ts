import { useColorScheme } from 'react-native';

// The same palette as the web app, expressed for StyleSheet.
//
// Two colour systems live here and they are deliberately kept apart:
//
//   * `accent` (pink) means "you can interact with this" — buttons, the
//     selected option, focus. It never encodes a value.
//   * the severity ramp in shared/symptoms.ts means "this is how bad it was".
//     It never appears on a control.
//
// If pink starts showing up inside a chart or a rating, the scale stops being
// readable, because the eye has no way to tell a value from a button.

export interface Theme {
  dark: boolean;
  surface: string;
  card: string;
  cardRaised: string;
  line: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentContrast: string;
  accentSoft: string;
  danger: string;
}

const light: Theme = {
  dark: false,
  surface: '#FAFAFA', // zinc-50
  card: '#FFFFFF',
  cardRaised: '#F4F4F5', // zinc-100
  line: '#E4E4E7', // zinc-200
  ink: '#18181B', // zinc-900
  muted: '#71717A', // zinc-500
  faint: '#A1A1AA', // zinc-400
  accent: '#DB2777', // pink-600, AA on white
  accentContrast: '#FFFFFF',
  accentSoft: '#FDF2F8', // pink-50
  danger: '#DC2626',
};

const dark: Theme = {
  dark: true,
  surface: '#09090B', // zinc-950
  card: '#18181B', // zinc-900
  cardRaised: '#27272A', // zinc-800
  line: '#27272A', // zinc-800
  ink: '#FAFAFA',
  muted: '#A1A1AA', // zinc-400 — zinc-500 is too dim on graphite
  faint: '#71717A',
  accent: '#EC4899', // pink-500
  accentContrast: '#09090B',
  accentSoft: 'rgba(236, 72, 153, 0.12)',
  danger: '#F87171',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = {
  md: 8,
  lg: 10,
  full: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

/** Matches the web's `tracking-tight` headers and muted metadata. */
export const type = {
  title: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600' as const, letterSpacing: -0.3 },
  subheading: { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  meta: { fontSize: 12, fontWeight: '400' as const },
  mono: { fontSize: 15, fontVariant: ['tabular-nums'] as const },
};
