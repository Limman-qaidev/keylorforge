export const colors = {
  canvas: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceSubtle: '#EEF4FA',
  text: '#101B2D',
  textMuted: '#59677B',
  border: '#D7E0EB',
  training: '#0758F6',
  trainingPressed: '#0047CD',
  progress: '#11BFAF',
  strength: '#7147E8',
  warning: '#D97706',
  error: '#D83B3B',
  errorSurface: '#FFF2F1',
  disabled: '#AEB9C7',
  onDark: '#FFFFFF',
  workoutCanvas: '#061525',
  workoutSurface: '#0D243A',
  workoutText: '#F8FBFF',
  workoutMuted: '#A9BED3',
  workoutAction: '#25BEEB',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;
export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const typography = {
  display: { fontSize: 36, fontWeight: '800' as const, lineHeight: 42 },
  title: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34 },
  section: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 23 },
  label: { fontSize: 14, fontWeight: '700' as const, lineHeight: 20 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
} as const;
export const touchTarget = 48;
export const elevation = {
  card: {
    elevation: 2,
    shadowColor: '#10243D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
} as const;
