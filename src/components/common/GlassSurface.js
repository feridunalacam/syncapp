import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from '../../context/ThemeContext';

/** Shared native glass, with an opaque accessibility/platform fallback. */
export default function GlassSurface({
  children,
  style,
  interactive = false,
  tintColor,
  ...props
}) {
  const { theme, isDark } = useTheme();
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduced,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  let native = false;
  try {
    native =
      Platform.OS === 'ios' && !reduced && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {}
  if (native)
    return (
      <GlassView
        {...props}
        glassEffectStyle="regular"
        tintColor={tintColor}
        colorScheme={isDark ? 'dark' : 'light'}
        isInteractive={interactive}
        style={[styles.surface, style]}
      >
        {children}
      </GlassView>
    );
  return (
    <View
      {...props}
      style={[
        styles.surface,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {!reduced && Platform.OS === 'ios' && (
        <BlurView
          pointerEvents="none"
          tint={isDark ? 'systemMaterialDark' : 'systemMaterialLight'}
          intensity={80}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  surface: { borderRadius: 26, overflow: 'hidden', borderCurve: 'continuous' },
});
