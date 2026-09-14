import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createSession,
  advanceSession,
  pauseSession,
  resumeSession,
  stopSession,
  skipSession,
  holdForAudio,
  releaseAudioHold,
} from '../../domain/workout';

/** Session clock owns playback. A cancellable readiness hold protects interval duration. */
export const useTimerLogic = ({
  routine,
  onPhaseChange,
  onComplete,
  onStateChange,
  onResumeAudio,
  requiresAudio,
}) => {
  const [session, setSession] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const sessionRef = useRef(null);
  const callbacks = useRef({});
  callbacks.current = { onPhaseChange, onComplete, onStateChange, onResumeAudio, requiresAudio };
  const generation = useRef(0);
  const timeout = useRef(null);
  const mounted = useRef(true);
  const commitRef = useRef(null);
  const commit = useCallback((candidate) => {
    const previous = sessionRef.current;
    if (candidate === previous) return candidate;
    let next = candidate;
    const phaseChanged =
      next &&
      ['running', 'paused'].includes(next.status) &&
      (previous?.index !== next.index ||
        previous?.startedAt !== next.startedAt ||
        previous?.skippedPhases !== next.skippedPhases);
    const resuming = next?.status === 'running' && previous?.status === 'paused' && !phaseChanged;
    const prepare = (phaseChanged || resuming) && next?.status === 'running';
    const phase = next?.timeline?.[next.index];
    const waitForAudio = prepare && callbacks.current.requiresAudio?.(next.routine, phase);
    if (phaseChanged || resuming || next?.status !== previous?.status) {
      generation.current++;
      clearTimeout(timeout.current);
    }
    const version = generation.current;
    if (prepare) setSyncError(null);
    if (waitForAudio) next = holdForAudio(next, Date.now(), !!phaseChanged);
    sessionRef.current = next;
    setSession(next);
    if (next?.status !== previous?.status) callbacks.current.onStateChange?.(next, previous);
    if (next?.status === 'completed' && previous?.status !== 'completed')
      callbacks.current.onComplete?.(next);
    if (phaseChanged || resuming) {
      const operation = () =>
        phaseChanged || previous?.audioPending
          ? callbacks.current.onPhaseChange?.(phase.phase, phase.round, next.status === 'paused')
          : callbacks.current.onResumeAudio?.(next);
      const fail = (message) => {
        if (!mounted.current || version !== generation.current) return;
        clearTimeout(timeout.current);
        setSyncError(message || 'Music could not start. Check your audio source, then resume.');
        commitRef.current(pauseSession(sessionRef.current, Date.now()));
      };
      if (waitForAudio)
        timeout.current = setTimeout(
          () => fail('Music is taking too long to start. Check your connection, then resume.'),
          10000,
        );
      // Invoke now so pause/stop can invalidate audio before any later async completion.
      let result;
      try {
        result = operation();
      } catch (error) {
        fail(error.message);
        return next;
      }
      Promise.resolve(result)
        .then((outcome) => {
          if (!mounted.current || version !== generation.current) return;
          clearTimeout(timeout.current);
          if (outcome?.success === false || outcome?.cancelled) {
            if (waitForAudio) fail(outcome.error);
            return;
          }
          if (waitForAudio) commitRef.current(releaseAudioHold(sessionRef.current, Date.now()));
        })
        .catch((error) => fail(error.message));
    }
    return next;
  }, []);
  commitRef.current = commit;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(timeout.current);
    };
  }, []);
  useEffect(() => {
    if (session?.status !== 'running') return;
    const interval = setInterval(() => commit(advanceSession(sessionRef.current, Date.now())), 100);
    const subscription = AppState.addEventListener('change', (state) => {
      // JS scheduling and remote Spotify cannot promise phase changes while suspended.
      // Calls, locking and leaving the app pause all audio; returning never auto-resumes.
      if (state !== 'active') commit(pauseSession(sessionRef.current, Date.now()));
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [session?.status, commit]);
  const start = useCallback(() => {
    if (!routine || ['running', 'paused'].includes(sessionRef.current?.status)) return null;
    return commit(createSession(routine, Date.now()));
  }, [routine, commit]);
  const pause = useCallback(() => commit(pauseSession(sessionRef.current, Date.now())), [commit]);
  const resume = useCallback(() => commit(resumeSession(sessionRef.current, Date.now())), [commit]);
  const stop = useCallback(() => commit(stopSession(sessionRef.current, Date.now())), [commit]);
  const skip = useCallback(
    (direction) => commit(skipSession(sessionRef.current, direction, Date.now())),
    [commit],
  );
  const reset = useCallback(() => {
    setSyncError(null);
    return commit(null);
  }, [commit]);
  return { session, syncError, start, pause, resume, stop, skip, reset };
};
