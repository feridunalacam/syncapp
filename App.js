import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SubscriptionProvider } from './src/context/SubscriptionContext';
import { AdsProvider } from './src/context/AdsContext';
import { AccountDataProvider } from './src/context/AccountDataContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Alert } from 'react-native';
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
import AccountPanel from './src/components/account/AccountPanel';

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
        filter: (url) =>
          !url.startsWith('syncapp://spotify-callback') && !url.startsWith('syncapp://auth/'),
        config: { screens: { Home: 'routine/:routineId' } },
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <TabNavigator />
    </NavigationContainer>
  );
}

function AccountApp() {
  const { ready, user, recoveryMode, dismissRecovery, error, clearError } = useAuth();
  const [showAccount, setShowAccount] = useState(false);
  useEffect(() => {
    if (error)
      Alert.alert('Account link', error, [
        { text: 'Dismiss', onPress: clearError },
        {
          text: 'Open account',
          onPress: () => {
            clearError();
            setShowAccount(true);
          },
        },
      ]);
  }, [error]);
  const { theme } = useTheme();
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  return (
    <SubscriptionProvider>
      <AdsProvider blocked={recoveryMode || showAccount || !!error}>
        <AccountPanel
          visible={recoveryMode || showAccount}
          onClose={() => {
            dismissRecovery();
            setShowAccount(false);
          }}
        />
        <AccountDataProvider key={user?.id || 'guest'}>
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
        </AccountDataProvider>
      </AdsProvider>
    </SubscriptionProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AccountApp />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
