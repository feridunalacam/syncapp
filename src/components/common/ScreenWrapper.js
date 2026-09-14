import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
export default function ScreenWrapper({
  children,
  style,
  backgroundColor,
  edges,
  includeTopInset = true,
  topOffset = 0,
}) {
  const { theme, isDark } = useTheme();
  const effectiveEdges = (edges || ['top', 'left', 'right']).filter(
    (edge) => includeTopInset || edge !== 'top',
  );
  return (
    <View style={{ flex: 1, backgroundColor: backgroundColor || theme.background }}>
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? ['#141517', '#111214', '#111214'] : ['#F6F7F3', '#F2F3EF', '#F2F3EF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView
        edges={effectiveEdges}
        style={[
          { flex: 1, paddingTop: topOffset, paddingBottom: 100 },
          style,
          { backgroundColor: 'transparent' },
        ]}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}
