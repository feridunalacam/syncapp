export const darkTheme = {
  // Backgrounds
  background: '#000000',
  surface: '#1a1a1a',
  card: '#1a1a1a',
  cardSecondary: '#2a2a2a',
  
  // Text
  text: '#ffffff',
  textSecondary: '#d1d5db',
  textTertiary: '#9ca3af',
  textInverse: '#000000',
  
  // Borders
  border: '#333333',
  borderLight: '#2a2a2a',
  borderDark: '#404040',
  
  // Buttons
  buttonPrimary: '#0d6efd',
  buttonSecondary: '#1a1a1a',
  buttonDisabled: '#2a2a2a',
  buttonText: '#ffffff',
  buttonTextSecondary: '#ffffff',
  
  // Special
  // In light theme this chip stays dark (so it pops against a white surface).
  // In dark theme we use a slightly lifted neutral so the chip stays readable
  // against the dark background instead of blending into the card.
  routineSelector: '#3a3a3c',
  routineSelectorText: '#ffffff',
  divider: '#333333',
  
  // Status
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
  
  // Typography
  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 36,
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  // Icon size scale (mirrors lightTheme).
  iconSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 28,
  },

  // Border radius scale (mirrors lightTheme).
  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    full: 9999,
  },

  // Spacing — must mirror lightTheme exactly so the same component renders
  // identically in both modes. Previously '2xl' was 28 here vs 16 in light.
  spacing: {
    xs: 2,
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
  },
  
  // Shadows
  shadow: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.5,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  
  // Input
  inputBackground: '#1a1a1a',
  inputBorder: '#333333',
  inputText: '#ffffff',
  inputPlaceholder: '#9ca3af',
  
  // Modal
  modalBackground: '#1a1a1a',
  modalOverlay: 'rgba(0, 0, 0, 0.7)',
  
  // Icon colors
  iconPrimary: '#ffffff',
  iconSecondary: '#9ca3af',
  iconTertiary: '#6b7280',
  
  // Special colors
  accent: '#06b6d4',
  accentLight: '#0a4a5a',
  roundBadge: '#ff6b35',
  roundBadgeBg: '#2a1a0f',
  roundBadgeBorder: '#4a2a1a',
  timerText: '#ffffff',
  workoutDetailBg: 'rgba(59, 130, 246, 0.15)',
};

