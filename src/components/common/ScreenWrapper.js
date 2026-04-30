import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

/**
 * Screen-level container that paints the themed background and respects the
 * device safe-area insets via `react-native-safe-area-context`.
 *
 * Props:
 * - `edges`             — array of edges to inset (default: all four).
 * - `includeTopInset`   — convenience flag; pass `false` if a sibling header
 *                         already takes care of the top inset.
 * - `topOffset`         — extra padding to add on top after the safe-area inset.
 * - `backgroundColor`   — override for the themed background.
 *
 * Note: previously this component dynamically `require()`d safe-area-context
 * and added a hard-coded 55px top padding when the module wasn't found. That
 * codepath added ~55px of extra padding on top of an already-correct
 * SafeAreaView, which made every screen sit further from the status bar than
 * intended. The dynamic guard is no longer needed because the dependency is
 * declared in package.json and Expo guarantees its presence.
 */
export default function ScreenWrapper({
  children,
  style,
  backgroundColor,
  edges,
  includeTopInset = true,
  topOffset = 0,
}) {
  const { theme } = useTheme();

  const baseEdges = edges ?? ['top', 'left', 'right', 'bottom'];
  const effectiveEdges = includeTopInset
    ? baseEdges.includes('top')
      ? baseEdges
      : [...baseEdges, 'top']
    : baseEdges.filter((edge) => edge !== 'top');

  return (
    <SafeAreaView
      edges={effectiveEdges}
      style={[
        styles.safeArea,
        { backgroundColor: backgroundColor || theme.background },
        topOffset ? { paddingTop: topOffset } : null,
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
