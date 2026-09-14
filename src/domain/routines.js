const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const seconds = (value, fallback, minimum = 0) =>
  Math.max(minimum, Math.round(number(value ?? fallback, fallback)));

/** Normalize legacy and edited routines at the boundary, preserving additional fields. */
export const normalizeRoutine = (input = {}) => {
  const rounds = Math.min(50, Math.max(1, Math.round(number(input.rounds, 1))));
  const workSec = seconds(input.workSec, 60, 1);
  const restSec = seconds(input.restSec, 30);
  return {
    ...input,
    name: typeof input.name === 'string' ? input.name.trim() : 'Routine',
    rounds,
    workSec,
    restSec,
    countdownBeforeStartDuration: seconds(input.countdownBeforeStartDuration, 0),
    restVolume: Math.min(100, seconds(input.restVolume, 100)),
    preparationVolume: Math.min(100, seconds(input.preparationVolume, 50)),
    workVolume: Math.min(100, seconds(input.workVolume, 100)),
    roundsData: Array.from({ length: rounds }, (_, index) => {
      const round = input.roundsData?.[index] ?? {};
      return {
        ...round,
        roundNumber: index + 1,
        workSec: seconds(round.workSec, workSec, 1),
        restSec: seconds(round.restSec, restSec),
      };
    }),
  };
};

export const validateRoutine = (input) => {
  if (!input.name?.trim()) return 'Give your routine a name.';
  if (input.name.trim().length > 60) return 'Use 60 characters or fewer for the name.';
  if (
    !Number.isInteger(Number(input.rounds)) ||
    Number(input.rounds) < 1 ||
    Number(input.rounds) > 50
  )
    return 'Choose between 1 and 50 rounds.';
  const values = [{ workSec: input.workSec, restSec: input.restSec }, ...(input.roundsData || [])];
  if (
    values.some(
      (r) =>
        !Number.isFinite(Number(r.workSec)) ||
        Number(r.workSec) < 1 ||
        !Number.isFinite(Number(r.restSec)) ||
        Number(r.restSec) < 0,
    )
  )
    return 'Work time must be at least 1 second. Rest time can be zero.';
  return null;
};

/** The same timeline drives the timer, duration labels and session records. */
export const buildTimeline = (input) => {
  const routine = normalizeRoutine(input);
  const timeline = [];
  if (routine.countdownBeforeStartDuration > 0)
    timeline.push({
      phase: 'beforeStart',
      round: 0,
      durationSec: routine.countdownBeforeStartDuration,
    });
  routine.roundsData.forEach((round, index) => {
    timeline.push({ phase: 'work', round: index + 1, durationSec: round.workSec });
    if (index < routine.rounds - 1 && round.restSec > 0)
      timeline.push({ phase: 'rest', round: index + 1, durationSec: round.restSec });
  });
  return timeline;
};
export const getRoutineDuration = (routine) =>
  buildTimeline(routine).reduce((sum, phase) => sum + phase.durationSec, 0);
export const getLogDuration = (log) =>
  Number.isFinite(log.actualDurationSec) && log.actualDurationSec >= 0
    ? log.actualDurationSec
    : getRoutineDuration(log);
export const getLogRounds = (log) =>
  Number.isFinite(log.roundsCompleted) ? log.roundsCompleted : log.rounds || 0;
