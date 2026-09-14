import React, { useState } from 'react';
import Animated, { useAnimatedStyle, withTiming, ReduceMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import GlassSurface from '../components/common/GlassSurface';
import HomeScreen from '../screens/Home/HomeScreen';
import RoutineStackScreen from './RoutineStackNavigator';
import ExploreScreen from '../screens/Explore/ExploreScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import { useTheme } from '../context/ThemeContext';
const Tab = createBottomTabNavigator();
const icons = {
  Home: 'timer-outline',
  Routine: 'layers-outline',
  Explore: 'compass-outline',
  Profile: 'person-outline',
};
const labels = {
  Home: 'Timer',
  Routine: 'Training',
  Explore: 'Discover',
  Profile: 'Profile',
};
function FloatingTabs({ state, descriptors, navigation }) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const slot = Math.max(0, barWidth - 12) / state.routes.length;
  const indicatorStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateX: withTiming(state.index * slot, {
            duration: 260,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    }),
    [state.index, slot],
  );
  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(12, insets.bottom) }]}>
      <GlassSurface
        interactive
        tintColor={`${theme.accent}0C`}
        style={styles.bar}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      >
        <LinearGradient
          pointerEvents="none"
          colors={
            isDark
              ? ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0)', `${theme.accent}09`]
              : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0.12)', `${theme.accent}0D`]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {slot > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.selection,
              {
                width: slot,
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.85)',
              },
              indicatorStyle,
            ]}
          >
            <LinearGradient
              colors={[
                `${theme.accent}36`,
                `${theme.accent}12`,
                isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={labels[route.name]}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!event.defaultPrevented) {
                  if (focused && route.name === 'Routine')
                    navigation.navigate('Routine', { screen: 'RoutineList' });
                  else navigation.navigate(route.name);
                }
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
            >
              <Ionicons
                name={icons[route.name]}
                size={23}
                color={focused ? theme.accent : theme.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={[styles.label, { color: focused ? theme.accent : theme.textSecondary }]}
              >
                {labels[route.name]}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}
export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabs {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Routine" component={RoutineStackScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 22,
    right: 22,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
  },
  selection: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 6,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bar: { flexDirection: 'row', padding: 6, borderRadius: 28, minHeight: 62 },
  item: {
    flex: 1,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 50,
  },
  label: { fontSize: 10, fontWeight: '600' },
});
