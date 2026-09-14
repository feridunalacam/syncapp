import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  createSession,
  advanceSession,
  pauseSession,
  resumeSession,
  stopSession,
  skipSession,
} from '../../domain/workout';

/** React adapter only. All timing rules live in the independently tested domain. */
export const useTimerLogic = ({ routine, onPhaseChange, onComplete }) => {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const callbacks = useRef({ onPhaseChange, onComplete });
  callbacks.current = { onPhaseChange, onComplete };
  const commit = useCallback((next) => {
    const previous = sessionRef.current;
    if (next === previous) return next;
    sessionRef.current = next;
    setSession(next);
    if (next?.status === 'completed' && previous?.status !== 'completed')
      callbacks.current.onComplete?.(next);
    else if (
      next &&
      ['running', 'paused'].includes(next.status) &&
      (previous?.index !== next.index || previous?.startedAt !== next.startedAt)
    ) {
      const phase = next.timeline[next.index];
      callbacks.current.onPhaseChange?.(phase.phase, phase.round, next.status === 'paused');
    }
    return next;
  }, []);
  useEffect(() => {
    if (session?.status !== 'running') return;
    const tick = () => commit(advanceSession(sessionRef.current, Date.now()));
    const interval = setInterval(tick, 100);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
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
  const reset = useCallback(() => commit(null), [commit]);
  return { session, start, pause, resume, stop, skip, reset };
};
