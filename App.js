import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RoutineProvider } from './src/context/RoutineContext';
import { PlatformProvider } from './src/context/PlatformContext';
import { PostProvider } from './src/context/PostContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import TabNavigator from './src/navigation/TabNavigator';
import { getNavTheme } from './src/navigation/theme';

// Complete web browser auth session
WebBrowser.maybeCompleteAuthSession();

function AppContent() {
  const { theme, isDark } = useTheme();
  const navTheme = getNavTheme(theme.background);
  
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <TabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RoutineProvider>
            <PlatformProvider>
              <PostProvider>
                <AppContent />
              </PostProvider>
            </PlatformProvider>
          </RoutineProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
