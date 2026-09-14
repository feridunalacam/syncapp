import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RoutineProvider, useRoutineContext } from './src/context/RoutineContext';
import { PlatformProvider } from './src/context/PlatformContext';
import { PostProvider } from './src/context/PostContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { WorkoutProvider } from './src/context/WorkoutContext';
import { SpotifyConnectionProvider } from './src/context/SpotifyConnectionContext';
import TabNavigator from './src/navigation/TabNavigator';
import { getNavTheme } from './src/navigation/theme';

// Complete web browser auth session
WebBrowser.maybeCompleteAuthSession();

function AppContent() {
  const { theme, isDark } = useTheme();
  const navTheme = getNavTheme(theme.background);
  const { isLoaded } = useRoutineContext();
  if (!isLoaded)
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );

  return (
    <NavigationContainer
      theme={navTheme}
      linking={{
        prefixes: [Linking.createURL('/'), 'syncapp://'],
        filter: (url) => !url.startsWith('syncapp://spotify-callback'),
        config: { screens: { Home: 'routine/:routineId' } },
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
              <SpotifyConnectionProvider>
                <PostProvider>
                  <WorkoutProvider>
                    <AppContent />
                  </WorkoutProvider>
                </PostProvider>
              </SpotifyConnectionProvider>
            </PlatformProvider>
          </RoutineProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
