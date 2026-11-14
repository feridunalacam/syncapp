import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import GlassSurface from '../../components/common/GlassSurface';
import AppleMusicWorkoutControl from '../../components/common/AppleMusicWorkoutControl';
import RoutineSoundtrackControl from '../../components/common/RoutineSoundtrackControl';
import { useWorkout } from '../../context/WorkoutContext';
import RoutineListScreen from '../Routine/RoutineListScreen';
import LogScreen from '../Log/LogScreen';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';

export default function TrainingScreen({ navigation }) {
  const { theme } = useTheme();
  const { selectedRoutine } = useWorkout();
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Training</Text>
        <Pressable
          onPress={() => navigation.navigate('Activity')}
          accessibilityRole="button"
          accessibilityLabel="View activity"
        >
          <GlassSurface interactive style={styles.activity}>
            <Ionicons name="stats-chart-outline" size={17} color={theme.text} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>Activity</Text>
          </GlassSurface>
        </Pressable>
        <Pressable
          onPress={() => navigateToCreateRoutine(navigation)}
          accessibilityRole="button"
          accessibilityLabel="Create routine"
        >
          <View style={[styles.add, { backgroundColor: theme.accent }]}>
            <Ionicons name="add" size={23} color={theme.accentText} />
          </View>
        </Pressable>
      </View>
      <AppleMusicWorkoutControl style={styles.appleMusic} />
      <RoutineSoundtrackControl
        key={selectedRoutine?.id || 'no-routine'}
        soundtrack={selectedRoutine?.soundtrack}
        routineName={selectedRoutine?.name}
        style={styles.appleMusic}
      />
      <RoutineListScreen navigation={navigation} embedded />
    </ScreenWrapper>
  );
}
export function ActivityScreen({ navigation }) {
  const { theme } = useTheme();
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to Training"
        >
          <GlassSurface interactive style={styles.add}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </GlassSurface>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Activity</Text>
      </View>
      <LogScreen embedded />
    </ScreenWrapper>
  );
}
const styles = StyleSheet.create({
  appleMusic: { marginHorizontal: 20, marginBottom: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: { flex: 1, fontSize: 28, fontWeight: '700', letterSpacing: -1 },
  activity: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  add: { height: 40, width: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
