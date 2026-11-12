import { useAccountData } from './AccountDataContext';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRoutineContext } from './RoutineContext';
import { usePlatformContext } from './PlatformContext';
import { useTimerLogic } from '../screens/Home/TimerLogic';
import { useAudioController } from '../hooks/useAudioController';
import { useCountdownSoundPlayer } from '../utils/countdownSoundPlayer';
import { normalizeRoutine, buildTimeline } from '../domain/routines';
import { sessionToLog } from '../domain/workout';
import { resolveRoundAudio } from '../domain/audio';
import useWorkoutCues from '../hooks/useWorkoutCues';
import { stopWorkoutCues, stopCuePreview, prepareWorkoutCues } from '../services/alerts/player';

const WorkoutContext = createContext(null);
export const WorkoutProvider = ({ children }) => {
  const { routines, addCompletedRoutine } = useRoutineContext();
  const platform = usePlatformContext();
  const [selectedId, setSelectedId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const selectedRoutine = useMemo(() => {
    const found =
      routines.find((r) => r.id === selectedId) || (selectedId === null ? routines[0] : null);
    return found ? normalizeRoutine(found) : null;
  }, [routines, selectedId]);
  const activeRoutine = snapshot || selectedRoutine;
  const selectedRef = useRef(selectedRoutine);
  selectedRef.current = selectedRoutine;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (selectedRoutine?.audioAlerts?.enabled) prepareWorkoutCues().catch(() => {});
  }, [selectedRoutine?.id, selectedRoutine?.audioAlerts?.enabled]);
  const countdownSoundPlayer = useCountdownSoundPlayer();
  const timerRef = useRef(null);
  const [interruptionReason, setInterruptionReason] = useState(null);
  const audio = useAudioController({
    ...platform,
    selectedRoutine: activeRoutine,
    countdownSoundPlayer,
    stopLocalCues: () => Promise.all([stopWorkoutCues(), stopCuePreview()]),
    onPlaybackInterrupted: (reason) => {
      if (timerRef.current?.session?.status !== 'running') return;
      setInterruptionReason(reason);
      timerRef.current.pause();
    },
  });
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const recorded = useRef(new Set());
  const finish = useCallback(
    (session) => {
      const log = sessionToLog(session);
      if (log && !recorded.current.has(log.sessionId)) {
        recorded.current.add(log.sessionId);
        addCompletedRoutine(log);
      }
    },
    [addCompletedRoutine],
  );
  const timer = useTimerLogic({
    routine: activeRoutine,
    onPhaseChange: audio.handlePhaseChange,
    onComplete: finish,
    requiresAudio: (routine, phase) =>
      !!resolveRoundAudio(routine, phase.phase, phase.round, platform.selectedPlatform),
    onResumeAudio: (session) => {
      if (audioRef.current.audioError) {
        const phase = session.timeline[session.index];
        return audioRef.current.handlePhaseChange(phase.phase, phase.round);
      }
      return audioRef.current.resumeMusic();
    },
    onStateChange: (next, previous) => {
      if (next?.status === 'paused') {
        stopWorkoutCues().catch(() => {});
        audioRef.current.pauseMusic();
      } else if ((!next || next.status === 'aborted') && previous) {
        stopWorkoutCues().catch(() => {});
        audioRef.current.stopMusic();
      } else if (next?.status === 'completed') {
        audioRef.current.stopMusic();
      }
    },
  });
  timerRef.current = timer;
  const { alertError } = useWorkoutCues(timer.session, audio.localCuesAllowed);
  const running = timer.session?.status === 'running';
  const paused = timer.session?.status === 'paused';
  const active = running || paused;
  const { setSyncPaused } = useAccountData();
  useEffect(() => {
    setSyncPaused(active);
    return () => setSyncPaused(false);
  }, [active, setSyncPaused]);
  useEffect(() => {
    if (!active) setSnapshot(null);
  }, [active]);
  // Poll sequentially: slow network responses cannot pile up overlapping requests.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let timeout;
    const poll = async () => {
      await audioRef.current.fetchPlayback();
      if (!cancelled) timeout = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [running]);
  const alertKey = useRef(null);
  useEffect(() => {
    const s = timer.session;
    if (
      !running ||
      !s ||
      s.audioPending ||
      s.routine.audioAlerts != null ||
      !audio.localCuesAllowed
    )
      return;
    const phase = s.timeline[s.index];
    const key =
      phase.phase === 'beforeStart'
        ? 'beforeStart'
        : phase.phase === 'work'
          ? 'endWork'
          : 'endRest';
    const sound =
      key === 'beforeStart'
        ? s.routine.countdownBeforeStartSound
        : key === 'endWork'
          ? s.routine.endWorkSound
          : s.routine.endRestSound;
    const unique = `${s.startedAt}:${s.index}`;
    if (
      sound &&
      s.remainingMs <= Math.max(1, sound.duration || 1) * 1000 &&
      alertKey.current !== unique
    ) {
      alertKey.current = unique;
      audio.playCountdownSound(key);
    }
  }, [timer.session, running, audio.playCountdownSound, audio.localCuesAllowed]);
  const stop = useCallback(() => {
    stopWorkoutCues().catch(() => {});
    const next = timer.stop();
    if (next?.status === 'aborted') finish(next);
  }, [timer.stop, finish]);
  const selectRoutine = useCallback(
    (id) => {
      if (active) stop();
      setSelectedId(id);
      setSnapshot(null);
      timer.reset();
    },
    [active, stop, timer.reset],
  );
  const beginSession = useCallback(
    (expectedRoutine) => {
      if (
        !mounted.current ||
        !expectedRoutine ||
        selectedRef.current !== expectedRoutine ||
        ['running', 'paused'].includes(timerRef.current?.session?.status)
      )
        return false;
      // Cloud replacement checks this ref before committing. Reserve it in the
      // Start action, before React's later render/effect can announce activity.
      setSyncPaused(true);
      let started;
      try {
        setInterruptionReason(null);
        setSnapshot(JSON.parse(JSON.stringify(expectedRoutine)));
        alertKey.current = null;
        started = timerRef.current.start();
        return !!started;
      } finally {
        if (!started) {
          setSnapshot(null);
          setSyncPaused(['running', 'paused'].includes(timerRef.current?.session?.status));
        }
      }
    },
    [setSyncPaused],
  );
  const toggle = useCallback(async () => {
    setInterruptionReason(null);
    if (paused) {
      timer.resume();
    } else if (running) {
      timer.pause();
    } else if (selectedRoutine) {
      await stopCuePreview();
      beginSession(selectedRoutine);
    }
  }, [paused, running, selectedRoutine, timer, audio, beginSession]);
  const phase = active
    ? timer.session.timeline[timer.session.index]
    : buildTimeline(selectedRoutine || {})[0];
  const value = {
    selectedRoutine: active ? timer.session.routine : selectedRoutine,
    selectRoutine,
    session: timer.session,
    alertError,
    isWorkoutRunning: active,
    isPaused: paused,
    isAudioSyncing: running && !!timer.session?.audioPending,
    currentPhase: phase.phase,
    currentRound: phase.round || 1,
    timeRemaining: active ? Math.ceil(timer.session.remainingMs / 1000) : phase.durationSec,
    phaseDuration: phase.durationSec,
    phaseProgress: active ? 1 - timer.session.remainingMs / (phase.durationSec * 1000) : 0,
    toggle,
    beginSession,
    stop,
    skipForward: () => timer.skip(1),
    skipBackward: () => timer.skip(-1),
    ...audio,
    audioError: timer.syncError || audio.audioError || interruptionReason,
  };
  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
};
export const useWorkout = () => useContext(WorkoutContext);
