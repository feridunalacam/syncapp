import { buildTimeline, normalizeRoutine } from './routines.js';

export const createSession = (routine, now) => {
  const snapshot = JSON.parse(JSON.stringify(normalizeRoutine(routine)));
  const timeline = buildTimeline(snapshot);
  return {
    routine: snapshot,
    timeline,
    index: 0,
    remainingMs: timeline[0].durationSec * 1000,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    elapsedMs: 0,
    roundsCompleted: 0,
    completedWorkIndices: [],
    skippedPhases: 0,
  };
};

/** Consume elapsed time across all boundaries, including return from background. */
export const advanceSession = (session, now) => {
  if (!session || session.status !== 'running' || session.audioPending) return session;
  let delta = Math.max(0, now - session.updatedAt);
  let { index, remainingMs, elapsedMs, roundsCompleted } = session;
  const completedWorkIndices = [...(session.completedWorkIndices || [])];
  while (delta >= remainingMs && index < session.timeline.length) {
    delta -= remainingMs;
    elapsedMs += remainingMs;
    if (session.timeline[index].phase === 'work' && !completedWorkIndices.includes(index)) {
      completedWorkIndices.push(index);
      roundsCompleted = completedWorkIndices.length;
    }
    index += 1;
    if (index === session.timeline.length)
      return {
        ...session,
        index,
        remainingMs: 0,
        elapsedMs,
        roundsCompleted,
        completedWorkIndices,
        status: 'completed',
        updatedAt: now,
        endedAt: now - delta,
      };
    remainingMs = session.timeline[index].durationSec * 1000;
  }
  return {
    ...session,
    index,
    remainingMs: remainingMs - delta,
    elapsedMs: elapsedMs + delta,
    roundsCompleted,
    completedWorkIndices,
    updatedAt: now,
  };
};
export const pauseSession = (session, now) => {
  const next = advanceSession(session, now);
  return next?.status === 'running' ? { ...next, status: 'paused' } : next;
};
export const resumeSession = (session, now) =>
  session?.status === 'paused' ? { ...session, status: 'running', updatedAt: now } : session;

/** Loading time is excluded from the workout, without inventing fixed extra seconds. */
export const holdForAudio = (session, now, phaseStart = false) => {
  if (!session || session.status !== 'running') return session;
  const duration = session.timeline[session.index].durationSec * 1000;
  const consumed = phaseStart ? duration - session.remainingMs : 0;
  return {
    ...session,
    audioPending: true,
    updatedAt: now,
    remainingMs: session.remainingMs + consumed,
    elapsedMs: Math.max(0, session.elapsedMs - consumed),
  };
};
export const releaseAudioHold = (session, now) =>
  session?.status === 'running' && session.audioPending
    ? { ...session, audioPending: false, updatedAt: now }
    : session;
export const stopSession = (session, now) => {
  const next = advanceSession(session, now);
  if (!next || !['running', 'paused'].includes(next.status)) return next;
  return { ...next, status: 'aborted', endedAt: now, updatedAt: now };
};
export const skipSession = (session, direction, now) => {
  const current = advanceSession(session, now);
  if (!current || !['running', 'paused'].includes(current.status)) return current;
  const index = Math.max(0, current.index + direction);
  if (index >= current.timeline.length)
    return {
      ...current,
      index,
      remainingMs: 0,
      status: 'completed',
      endedAt: now,
      skippedPhases: current.skippedPhases + 1,
    };
  return {
    ...current,
    index,
    audioPending: false,
    remainingMs: current.timeline[index].durationSec * 1000,
    updatedAt: now,
    skippedPhases: current.skippedPhases + 1,
  };
};
export const sessionToLog = (session) => {
  if (!session || !['completed', 'aborted'].includes(session.status) || session.elapsedMs <= 0)
    return null;
  // A cancelled preparation is not a workout.
  if (session.status === 'aborted' && session.timeline[session.index]?.phase === 'beforeStart')
    return null;
  return {
    ...session.routine,
    sessionId: `${session.routine.id}-${session.startedAt}`,
    startedAt: new Date(session.startedAt).toISOString(),
    completedAt: new Date(session.endedAt).toISOString(),
    actualDurationSec: Math.round(session.elapsedMs / 1000),
    status: session.status,
    roundsCompleted: session.roundsCompleted,
    totalRounds: session.routine.rounds,
    skippedPhases: session.skippedPhases,
  };
};
