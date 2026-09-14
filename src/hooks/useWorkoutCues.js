import { useEffect, useRef, useState } from 'react';
import { planSessionCues } from '../domain/alerts';
import { playWorkoutCue, stopWorkoutCues } from '../services/alerts/player';

/** Session time is the source of truth; audio never advances the workout clock. */
export default function useWorkoutCues(session) {
  const previous = useRef(null);
  const played = useRef(new Set());
  const revision = useRef(0);
  const [alertError, setAlertError] = useState(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = session;
    const newRun =
      before?.startedAt !== session?.startedAt || before?.routine?.id !== session?.routine?.id;
    if (newRun) {
      played.current.clear();
      setAlertError(null);
    }
    if (
      !session ||
      session.status === 'paused' ||
      session.status === 'aborted' ||
      newRun ||
      before?.index !== session.index ||
      (session.status === 'completed' && before?.status !== 'completed') ||
      before?.skippedPhases !== session.skippedPhases
    ) {
      revision.current++;
      stopWorkoutCues().catch(() => {});
    }
    for (const event of planSessionCues(before, session)) {
      if (played.current.has(event.id)) continue;
      played.current.add(event.id);
      const version = ++revision.current;
      // Never begin a sound loaded after its useful timing window.
      const remainingInSecond = session.remainingMs % 1000 || 1000;
      const expiresAt = session.updatedAt + (event.kind === 'count' ? remainingInSecond : 1000);
      playWorkoutCue({ ...event, expiresAt })
        .then(() => {
          if (version === revision.current) setAlertError(null);
        })
        .catch((error) => {
          if (version === revision.current)
            setAlertError(error.message || 'An alert could not be played.');
        });
    }
  }, [session]);
  useEffect(
    () => () => {
      revision.current++;
      stopWorkoutCues().catch(() => {});
    },
    [],
  );
  return { alertError };
}
