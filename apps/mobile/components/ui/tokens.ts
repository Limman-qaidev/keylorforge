import { Platform } from 'react-native';

/** Light-theme visual decisions for the KeylorFit mobile product. */
export const colors = {
  accent: '#C2411A',
  accentPressed: '#A93616',
  background: '#F6F6F2',
  border: '#D9DCD4',
  card: '#FFFFFF',
  danger: '#B42318',
  dangerPressed: '#8E1C13',
  onAccent: '#FFFFFF',
  onDanger: '#FFFFFF',
  primary: '#17211D',
  secondary: '#5D6761',
  subtle: '#E8ECE6',
  success: '#067647',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const typography = {
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 14, lineHeight: 20 },
  display: { fontSize: 36, lineHeight: 42 },
  eyebrow: { fontSize: 13, lineHeight: 18 },
  heading: { fontSize: 28, lineHeight: 34 },
  label: { fontSize: 15, lineHeight: 20 },
} as const;

export const touchTarget = 48;

export const elevation = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: '#17211D',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
});
