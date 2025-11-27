import { DefaultTheme } from '@react-navigation/native';

export const getNavTheme = (backgroundColor = '#ffffff') => ({
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: backgroundColor,
  },
});

// Default export for backward compatibility
export const navTheme = getNavTheme();



