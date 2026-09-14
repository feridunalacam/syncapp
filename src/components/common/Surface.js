import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

/** Opaque content surfaces. Glass is reserved for the floating control layer. */
export default function Surface({ children, variant = 'card', style, ...props }) {
  const { theme } = useTheme();
  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          backgroundColor:
            variant === 'sheet'
              ? theme.modalBackground
              : variant === 'inset'
                ? theme.cardSecondary
                : theme.card,
          borderColor: theme.border,
        },
        variant === 'sheet' ? styles.sheet : variant === 'inset' ? styles.inset : styles.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderCurve: 'continuous', overflow: 'hidden' },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  inset: { borderRadius: 14 },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
});
