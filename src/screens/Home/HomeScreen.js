import Surface from '../../components/common/Surface';
import SpotifyDevicePicker from '../../components/common/SpotifyDevicePicker';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { useRoutineContext } from '../../context/RoutineContext';
import { useWorkout } from '../../context/WorkoutContext';
import { getRoutineDuration, buildTimeline } from '../../domain/routines';
import { formatTime } from '../../utils/timeFormatters';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import GlassSurface from '../../components/common/GlassSurface';
import Sheet from '../../components/common/Sheet';
import { TimerDesign } from './components/TimerDesign';
import { MusicPlayerPreview } from './components/MusicPlayerPreview';

const intervalLayout = LinearTransition.duration(240).reduceMotion(ReduceMotion.System);
const intervalEnter = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const intervalExit = FadeOutUp.duration(180).reduceMotion(ReduceMotion.System);

function IconButton({ icon, label, onPress, disabled = false, selected = false }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
    >
      <GlassSurface interactive style={styles.iconButton}>
        <Ionicons
          name={icon}
          size={20}
          color={disabled ? theme.textTertiary : selected ? theme.accent : theme.text}
        />
      </GlassSurface>
    </Pressable>
  );
}
export default function HomeScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { routines } = useRoutineContext();
  const workout = useWorkout();
  const [picker, setPicker] = useState(false);
  const {
    selectedRoutine,
    isWorkoutRunning,
    isPaused,
    currentPhase,
    currentRound,
    timeRemaining,
    phaseProgress,
    track,
    musicProgress,
    isMusicPlaying,
  } = workout;
  useEffect(() => {
    const id = route?.params?.routineId;
    if (!id) return;
    if (routines.some((r) => r.id === id)) workout.selectRoutine(id);
    else Alert.alert('Routine not found', 'This routine may have been deleted.');
    navigation.setParams({ routineId: undefined });
  }, [route?.params?.routineId]);
  const edit = () => navigateToCreateRoutine(navigation, selectedRoutine);
  const stop = () =>
    Alert.alert('End session?', 'Your progress will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End session', onPress: workout.stop },
    ]);
  const choose = (id) => {
    const select = () => {
      workout.selectRoutine(id);
      setPicker(false);
    };
    if (isWorkoutRunning)
      Alert.alert('Switch routine?', 'Your current session will end and be saved.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: select },
      ]);
    else select();
  };
  const timeline = selectedRoutine ? buildTimeline(selectedRoutine) : [];
  const index = isWorkoutRunning ? workout.session.index : -1;
  const upcoming = timeline.slice(Math.max(0, index), Math.max(0, index) + 3);
  const round = selectedRoutine?.roundsData?.[currentRound - 1];
  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>
            Sync<Text style={{ color: theme.accent }}>.</Text>
          </Text>
          <IconButton
            icon="add"
            label="Create routine"
            onPress={() => navigateToCreateRoutine(navigation)}
          />
        </View>
        <Pressable
          onPress={() => setPicker(true)}
          accessibilityLabel="Choose routine"
          style={styles.selection}
        >
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: theme.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.6 }}
            >
              {selectedRoutine?.name || 'Choose a routine'}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 5 }}>
              {selectedRoutine
                ? `${selectedRoutine.rounds} rounds · ${formatTime(getRoutineDuration(selectedRoutine))}`
                : 'Create or select a routine to start'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={theme.textSecondary} />
        </Pressable>
        <Surface
          variant="card"
          style={[styles.timerCard, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <TimerDesign
            {...{
              timeRemaining,
              currentPhase,
              currentRound,
              selectedRoutine,
              isWorkoutRunning,
              isPaused,
            }}
            progress={phaseProgress}
          />
          <View style={[styles.intervalMeta, { borderColor: theme.border }]}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Work{' '}
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {formatTime(round?.workSec || selectedRoutine?.workSec || 0)}
              </Text>
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              Rest{' '}
              <Text style={{ color: theme.text, fontWeight: '600' }}>
                {formatTime(round?.restSec ?? selectedRoutine?.restSec ?? 0)}
              </Text>
            </Text>
            <Pressable
              onPress={edit}
              disabled={!selectedRoutine}
              accessibilityLabel="Edit current routine"
            >
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>Edit</Text>
            </Pressable>
          </View>
        </Surface>
        <View style={styles.controls}>
          <IconButton
            icon="play-skip-back"
            label="Previous phase"
            onPress={workout.skipBackward}
            disabled={!isWorkoutRunning}
          />
          <Pressable
            onPress={workout.toggle}
            disabled={!selectedRoutine}
            accessibilityRole="button"
            accessibilityLabel={
              isPaused ? 'Resume session' : isWorkoutRunning ? 'Pause session' : 'Start session'
            }
            style={[
              styles.start,
              { backgroundColor: selectedRoutine ? theme.accent : theme.cardSecondary },
            ]}
          >
            <Ionicons
              name={isWorkoutRunning && !isPaused ? 'pause' : 'play'}
              size={20}
              color={selectedRoutine ? theme.accentText : theme.textTertiary}
            />
            <Text
              style={{
                color: selectedRoutine ? theme.accentText : theme.textTertiary,
                fontWeight: '700',
                fontSize: 16,
              }}
            >
              {isPaused ? 'Resume' : isWorkoutRunning ? 'Pause' : 'Start session'}
            </Text>
          </Pressable>
          <IconButton
            icon="play-skip-forward"
            label="Next phase"
            onPress={workout.skipForward}
            disabled={!isWorkoutRunning}
          />
        </View>
        {isWorkoutRunning && (
          <Pressable onPress={stop} accessibilityLabel="End session" style={styles.end}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>End session</Text>
          </Pressable>
        )}
        <Surface
          variant="card"
          style={[styles.music, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={styles.musicTop}>
            <MusicPlayerPreview
              {...{
                track,
                musicProgress,
                isMusicPlaying: isMusicPlaying && isWorkoutRunning && !isPaused,
                isWorkoutRunning,
                selectedRoutine,
                currentRound,
                currentPhase,
              }}
            />
            <Pressable
              onPress={edit}
              disabled={!selectedRoutine}
              accessibilityLabel="Edit routine audio"
              style={{ padding: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <SpotifyDevicePicker />
          {track && (
            <View style={[styles.musicControls, { borderColor: theme.border }]}>
              {[
                {
                  icon: 'shuffle',
                  label: 'Shuffle music',
                  action: workout.toggleShuffle,
                  selected: workout.isShuffled,
                },
                {
                  icon: 'play-skip-back-outline',
                  label: 'Previous track',
                  action: workout.skipPrevious,
                },
                {
                  icon: 'play-skip-forward-outline',
                  label: 'Next track',
                  action: workout.skipNext,
                },
                {
                  icon: 'repeat',
                  label: 'Repeat music',
                  action: workout.toggleRepeat,
                  selected: workout.isRepeating,
                },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  onPress={item.action}
                  accessibilityLabel={item.label}
                  style={{ padding: 8 }}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={item.selected ? theme.accent : theme.textSecondary}
                  />
                </Pressable>
              ))}
            </View>
          )}
          {(workout.audioError || workout.alertError) && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.error, fontSize: 12, lineHeight: 18, marginTop: 10 }}
            >
              {workout.audioError || workout.alertError}
            </Text>
          )}
        </Surface>
        {upcoming.length > 0 && (
          <Animated.View layout={intervalLayout} collapsable={false}>
            <View style={styles.sectionRow}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Intervals</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                {timeline.length} intervals
              </Text>
            </View>
            {upcoming.map((item, n) => (
              <Animated.View
                key={`${selectedRoutine?.id}-${item.round}-${item.phase}`}
                entering={intervalEnter}
                exiting={intervalExit}
                layout={intervalLayout}
                style={[styles.intervalRow, { borderColor: theme.border }]}
              >
                <View
                  style={[
                    styles.intervalIcon,
                    {
                      backgroundColor:
                        item.phase === 'rest' ? theme.cardSecondary : theme.accentLight,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      item.phase === 'rest'
                        ? 'pause-outline'
                        : item.phase === 'beforeStart'
                          ? 'hourglass-outline'
                          : 'flash-outline'
                    }
                    size={16}
                    color={item.phase === 'rest' ? theme.textSecondary : theme.accent}
                  />
                </View>
                <Text style={{ color: theme.text, fontSize: 13, flex: 1 }}>
                  {item.phase === 'beforeStart' ? 'Preparation' : `Round ${item.round}`}
                  <Text style={{ color: theme.textSecondary }}>
                    {' '}
                    {item.phase === 'work' ? 'Work' : item.phase === 'rest' ? 'Rest' : ''}
                  </Text>
                </Text>
                {isWorkoutRunning && n === 0 && (
                  <Text
                    style={{
                      color: theme.accent,
                      fontSize: 10,
                      fontWeight: '600',
                      marginRight: 10,
                    }}
                  >
                    {isPaused ? 'Paused' : 'Now'}
                  </Text>
                )}
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 14,
                    fontWeight: '500',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTime(item.durationSec)}
                </Text>
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
      <Sheet visible={picker} title="Routines" onClose={() => setPicker(false)}>
        <ScrollView>
          {routines.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => choose(r.id)}
              style={[styles.option, { borderColor: theme.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{r.name}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 5 }}>
                  {r.rounds} rounds · {formatTime(getRoutineDuration(r))}
                </Text>
              </View>
              <Ionicons
                name={r.id === selectedRoutine?.id ? 'checkmark-circle' : 'chevron-forward'}
                size={21}
                color={r.id === selectedRoutine?.id ? theme.accent : theme.textSecondary}
              />
            </Pressable>
          ))}
          {!routines.length && (
            <Text style={{ color: theme.textSecondary, marginBottom: 20 }}>No saved routines.</Text>
          )}
        </ScrollView>
      </Sheet>
    </ScreenWrapper>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -1.5 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selection: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  timerCard: { borderRadius: 25, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  intervalMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  start: {
    flex: 1,
    height: 50,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  end: { alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 14 },
  music: { padding: 14, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, marginBottom: 18 },
  musicTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  musicControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  intervalIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
