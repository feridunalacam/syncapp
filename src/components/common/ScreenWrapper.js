import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

// Try to import SafeAreaView - handle case where it might be undefined
let RNSafeAreaView = null;
let RNSafeAreaInsets = null;
let isSafeAreaViewAvailable = false;

try {
  const safeAreaModule = require('react-native-safe-area-context');
  if (safeAreaModule && safeAreaModule.SafeAreaView) {
    RNSafeAreaView = safeAreaModule.SafeAreaView;
    // Verify it's actually a valid component, not just undefined
    if (RNSafeAreaView && (typeof RNSafeAreaView === 'function' || (typeof RNSafeAreaView === 'object' && RNSafeAreaView.$$typeof))) {
      isSafeAreaViewAvailable = true;
    } else {
      RNSafeAreaView = null;
    }
  }
  if (safeAreaModule && safeAreaModule.useSafeAreaInsets) {
    RNSafeAreaInsets = safeAreaModule.useSafeAreaInsets;
  }
} catch (e) {
  // Module not available or error loading
  RNSafeAreaView = null;
  RNSafeAreaInsets = null;
  isSafeAreaViewAvailable = false;
}

// Fallback hook that returns default insets if the real hook is not available
const useSafeAreaInsetsFallback = () => ({ top: 0, bottom: 0, left: 0, right: 0 });

// Use the real hook if available, otherwise use fallback
const useInsets = (RNSafeAreaInsets && typeof RNSafeAreaInsets === 'function') 
  ? RNSafeAreaInsets 
  : useSafeAreaInsetsFallback;

export default function ScreenWrapper({
  children,
  style,
  backgroundColor,
  edges = ['left', 'right', 'bottom'],
  includeTopInset = false,
  topOffset = 0,
}) {
  // Always call a hook (hooks must be called unconditionally)
  const insets = useInsets();
  const { theme } = useTheme();
  const effectiveBackgroundColor = backgroundColor || theme.background;
  const effectiveEdges = includeTopInset ? edges.concat('top') : edges.filter((edge) => edge !== 'top');
  const paddingTop = (includeTopInset ? insets.top : 55) + topOffset;

  // If SafeAreaView is available and valid, use it with edges prop
  // Only render if we're absolutely sure it's a valid component
  if (isSafeAreaViewAvailable && RNSafeAreaView) {
    return React.createElement(
      RNSafeAreaView,
      {
        edges: effectiveEdges,
        style: [
          styles.safeArea,
          { backgroundColor: effectiveBackgroundColor, paddingTop },
          style,
        ],
      },
      children
    );
  }

  // If SafeAreaView is not available, apply manual padding
  const safeAreaStyle = {
    paddingTop: includeTopInset ? insets.top + topOffset : paddingTop,
    paddingBottom: effectiveEdges.includes('bottom') ? insets.bottom : 0,
    paddingLeft: effectiveEdges.includes('left') ? insets.left : 0,
    paddingRight: effectiveEdges.includes('right') ? insets.right : 0,
  };

  // Otherwise, use regular View with manual padding
  return (
    <View
      style={[
        styles.safeArea,
        { backgroundColor: effectiveBackgroundColor },
        safeAreaStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});

