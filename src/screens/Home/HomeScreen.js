import Surface from '../../components/common/Surface';
import SpotifyDevicePicker from '../../components/common/SpotifyDevicePicker';
import React, { useState, useEffect, useRef } from 'react';
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
import { useAppleMusicConnection } from '../../context/AppleMusicConnectionContext';
import AppleMusicWorkoutControl from '../../components/common/AppleMusicWorkoutControl';
import RoutineSoundtrackControl from '../../components/common/RoutineSoundtrackControl';
import { getRoutineDuration, buildTimeline } from '../../domain/routines';
import { formatTime } from '../../utils/timeFormatters';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';
import { createRoutineSelectionController } from '../../navigation/routineSelection';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import GlassSurface from '../../components/common/GlassSurface';
import Sheet from '../../components/common/Sheet';
import { TimerDesign } from './components/TimerDesign';
import { MusicPlayerPreview } from './components/MusicPlayerPreview';
import useSessionAds from '../../hooks/useSessionAds';
import { sessionToLog } from '../../domain/workout';

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
  const appleMusic = useAppleMusicConnection();
  const [picker, setPicker] = useState(false);
  const [dismissedSession, setDismissedSession] = useState(null);
  const finished = sessionToLog(workout.session);
  const sessionAds = useSessionAds({
    workout,
    blocked: picker,
    sessionKey: finished?.sessionId || null,
    onFinish: setDismissedSession,
  });
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
  const latestSelection = useRef(null);
  latestSelection.current = { routines, workout };
  const selection = useRef(null);
  if (!selection.current)
    selection.current = createRoutineSelectionController({
      getState: () => ({
        routines: latestSelection.current.routines,
        active: latestSelection.current.workout.isWorkoutRunning,
        selectedId: latestSelection.current.workout.selectedRoutine?.id,
      }),
      selectRoutine: (id) => latestSelection.current.workout.selectRoutine(id),
      confirmSwitch: (onConfirm) =>
        Alert.alert('Switch routine?', 'Your current session will end and be saved.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', onPress: onConfirm },
        ]),
      onMissing: () => Alert.alert('Routine not found', 'This routine may have been deleted.'),
      onSelected: () => {
        setPicker(false);
        sessionAds.recordRoutineSelection();
      },
    });
  useEffect(() => () => selection.current.dispose(), []);
  useEffect(() => {
    const id = route?.params?.routineId;
    if (!id) return;
    selection.current.request(id);
    navigation.setParams({ routineId: undefined });
  }, [route?.params?.routineId]);
  const edit = () => navigateToCreateRoutine(navigation, selectedRoutine);
  const stop = () =>
    Alert.alert('End session?', 'Your progress will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End session', onPress: workout.stop },
    ]);
  const choose = (id) => selection.current.request(id);
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
            disabled={sessionAds.busy}
            onPress={() => navigateToCreateRoutine(navigation)}
          />
        </View>
        <Pressable
          onPress={() => setPicker(true)}
          accessibilityLabel="Choose routine"
          accessibilityRole="button"
          disabled={sessionAds.busy}
          accessibilityState={{ disabled: sessionAds.busy }}
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
                ? `${selectedRoutine.rounds} round${selectedRoutine.rounds === 1 ? '' : 's'} · ${formatTime(getRoutineDuration(selectedRoutine))}`
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
            isAudioSyncing={workout.isAudioSyncing}
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
              disabled={!selectedRoutine || sessionAds.busy}
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
            onPress={sessionAds.startOrToggle}
            disabled={!selectedRoutine || sessionAds.busy}
            accessibilityRole="button"
            accessibilityLabel={
              sessionAds.busy
                ? 'Preparing session'
                : isPaused
                  ? 'Resume session'
                  : isWorkoutRunning
                    ? 'Pause session'
                    : 'Start session'
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
              {sessionAds.busy
                ? 'Please wait…'
                : isPaused
                  ? 'Resume'
                  : isWorkoutRunning
                    ? 'Pause'
                    : 'Start session'}
            </Text>
          </Pressable>
          <IconButton
            icon="play-skip-forward"
            label="Next phase"
            onPress={workout.skipForward}
            disabled={!isWorkoutRunning}
          />
        </View>
        {!isWorkoutRunning && sessionAds.adSupported && (
          <Text style={[styles.adNotice, { color: theme.textSecondary }]}>
            Free sessions may show an ad before starting or after finishing. Sync Pro removes all
            ads.
          </Text>
        )}
        {finished && finished.sessionId !== dismissedSession && !isWorkoutRunning && (
          <Surface variant="card" style={[styles.sessionSummary, { backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 17 }}>
              {finished.status === 'completed' ? 'Session complete' : 'Session ended'}
            </Text>
            <Text style={{ color: theme.textSecondary, marginTop: 7, lineHeight: 20 }}>
              {finished.name} · {formatTime(finished.actualDurationSec)} ·{' '}
              {finished.roundsCompleted} round{finished.roundsCompleted === 1 ? '' : 's'} completed
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish session"
              disabled={sessionAds.busy}
              onPress={sessionAds.finish}
              style={[styles.finishButton, { backgroundColor: theme.cardSecondary }]}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>Continue</Text>
            </Pressable>
          </Surface>
        )}
        {isWorkoutRunning && (
          <Pressable onPress={stop} accessibilityLabel="End session" style={styles.end}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>End session</Text>
          </Pressable>
        )}
        <RoutineSoundtrackControl
          key={selectedRoutine?.id || 'no-routine'}
          soundtrack={selectedRoutine?.soundtrack}
          routineName={selectedRoutine?.name}
          style={styles.appleMusic}
        />
        <AppleMusicWorkoutControl style={styles.appleMusic} />
        {appleMusic.player?.isActive?.() && (
          <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 18 }}>
            Apple Music plays independently. Your chosen alerts pause music and play before it
            continues. Clear the queue to use round music assignments.
          </Text>
        )}
        {!appleMusic.player?.isActive?.() && (
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
                disabled={!selectedRoutine || sessionAds.busy}
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
        )}
        {upcoming.length > 0 && (
          <Animated.View layout={intervalLayout} collapsable={false}>
            <View style={styles.sectionRow}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Intervals</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                {timeline.length} interval{timeline.length === 1 ? '' : 's'}
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
                  {r.rounds} round{r.rounds === 1 ? '' : 's'} · {formatTime(getRoutineDuration(r))}
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
  appleMusic: { marginBottom: 14 },
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
  adNotice: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: -4, marginBottom: 16 },
  sessionSummary: { padding: 18, borderRadius: 20, marginBottom: 18 },
  finishButton: { padding: 14, borderRadius: 14, alignItems: 'center', marginTop: 14 },
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
