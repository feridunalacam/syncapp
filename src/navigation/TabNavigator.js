import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import HomeScreen from '../screens/Home/HomeScreen';
import RoutineStackScreen from './RoutineStackNavigator';
import ExploreScreen from '../screens/Explore/ExploreScreen';
import LogScreen from '../screens/Log/LogScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();

  const bottomInset = Math.max(insets.bottom, 8);
  const iconPadding = Math.max(bottomInset * 0.3, 4);
  const tabBarHeight = 73 + iconPadding;

  // Pick blur tint + scrim based on theme so the tab bar feels native in
  // both modes instead of being permanently dark-tinted glass.
  const blurTint = isDark ? 'dark' : 'light';
  const scrimColor = isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.55)';
  const fallbackColor = isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)';
  const hairlineColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <Tab.Navigator
      initialRouteName="Home"
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.iconSecondary,
        tabBarSafeAreaInsets: { bottom: iconPadding },
        tabBarBackground: () => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <BlurView
              intensity={30}
              tint={blurTint}
              reducedTransparencyFallbackColor={fallbackColor}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: scrimColor,
            }} />
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 0.5,
              backgroundColor: hairlineColor,
            }} />
          </View>
        ),
        tabBarStyle: {
          height: tabBarHeight,
          paddingTop: 0,
          paddingBottom: iconPadding,
          paddingHorizontal: 25,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          elevation: 0,
          shadowOpacity: 0,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 0,
          borderWidth: 0,
          shadowColor: 'transparent',
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarItemStyle: {
          paddingTop: 0,
          paddingBottom: 2,
          marginTop: 10,
          flex: 0.9,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const adjustedSize = Math.round((size ?? 20) * (focused ? 1.25 : 1.05));
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home-sharp' : 'home-outline';
              break;
            case 'Routine':
              iconName = focused ? 'list' : 'list-outline';
              break;
            case 'Explore':
              iconName = focused ? 'search' : 'search-outline';
              break;
            case 'Log':
              iconName = focused ? 'document-text' : 'document-text-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person-circle' : 'person-circle-outline';
              break;
            default:
              break;
          }
          return <Ionicons name={iconName} size={adjustedSize} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen 
        name="Routine" 
        component={RoutineStackScreen}
        listeners={({ navigation, route }) => ({
          tabPress: (e) => {
            // Only reset to RoutineList if user is already on Routine tab and presses it again
            // This preserves CreateRoutineScreen state when switching from other tabs
            const state = navigation.getState();
            const currentTabIndex = state.index;
            const currentTab = state.routes[currentTabIndex];
            const routineTab = state.routes.find(r => r.name === 'Routine');
            
            // Only reset if user is already on Routine tab (double-tap behavior)
            if (currentTab?.name === 'Routine' && routineTab?.state) {
              const currentScreen = routineTab.state.routes[routineTab.state.index]?.name;
              // If we're on CreateRoutine and already on Routine tab, reset to RoutineList
              if (currentScreen === 'CreateRoutine') {
                e.preventDefault();
                navigation.navigate('Routine', {
                  screen: 'RoutineList',
                });
              }
            }
            // If switching from another tab, don't prevent default - preserve CreateRoutine state
          },
        })}
      />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Log" component={LogScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

