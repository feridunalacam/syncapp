/** Workout cues use local sound effects, independent of the selected music service. */
const signal = (uri, name, duration = 1) => ({
  id: uri.split('://')[1],
  name,
  uri,
  platform: uri.startsWith('speech:') ? 'speech' : 'voices',
  duration,
});

const SOUNDS = {
  go: signal('speech://go', 'Go'),
  rest: signal('speech://rest', 'Rest'),
  start: signal('speech://start', 'Start'),
  complete: signal('speech://complete', 'Workout complete', 2),
  tick: signal('voices://cue_tick', 'Short beep', 0.1),
  gong: signal('voices://cue_gong', 'Gong', 1.85),
  bell: signal('voices://cue_boxing_bell', 'Boxing bell', 1),
  chime: signal('voices://cue_chime', 'Finish chime', 0.65),
};

const SIGNAL_KEYS = ['start', 'rest', 'work', 'finish'];
const finite = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, fallback, max = 100) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

const normalizeSound = (value) => {
  if (!object(value) || value.platform === 'spotify' || typeof value.uri !== 'string') return null;
  const uri = value.uri.trim();
  let platform;
  if (/^speech:\/\/(go|rest|start|complete|count\/(?:[1-9]|10))$/.test(uri)) {
    platform = 'speech';
  } else if (/^voices:\/\/[a-z0-9_-]{1,80}$/i.test(uri)) {
    platform = 'voices';
  } else if (/^(?:https?:\/\/[^\s]+|file:\/\/[^\s]+|content:\/\/[^\s]+)$/i.test(uri)) {
    platform = 'device';
  } else return null;
  return {
    id: text(value.id, uri, 200),
    name: text(value.name, 'Alert sound'),
    uri,
    platform,
    duration: Math.min(120, Math.max(0, finite(value.duration, 1))),
  };
};

/**
 * Missing configuration stays disabled: callers can keep legacy alerts unchanged.
 * Presets explicitly opt in. Unrecognized or malformed values never enable audio.
 */
export const normalizeAlertConfig = (raw) => {
  const config = object(raw) ? raw : {};
  const countdown = object(config.countdown) ? config.countdown : {};
  const signals = object(config.signals) ? config.signals : {};
  const defaults = {
    start: SOUNDS.go,
    rest: SOUNDS.rest,
    work: SOUNDS.start,
    finish: SOUNDS.complete,
  };
  return {
    version: 1,
    enabled: config.enabled === true && (config.version === undefined || config.version === 1),
    volume: Math.min(100, Math.max(0, finite(config.volume, 100))),
    language: config.language === 'tr-TR' ? 'tr-TR' : 'en-US',
    countdown: {
      mode: ['voice', 'beep', 'off'].includes(countdown.mode) ? countdown.mode : 'voice',
      seconds: [3, 5, 10].includes(countdown.seconds) ? countdown.seconds : 3,
      preparation: typeof countdown.preparation === 'boolean' ? countdown.preparation : true,
      work: typeof countdown.work === 'boolean' ? countdown.work : true,
      rest: typeof countdown.rest === 'boolean' ? countdown.rest : true,
    },
    signals: Object.fromEntries(
      SIGNAL_KEYS.map((key) => [
        key,
        normalizeSound(
          Object.prototype.hasOwnProperty.call(signals, key) ? signals[key] : defaults[key],
        ),
      ]),
    ),
  };
};

/** Preserve saved speech settings while playing only our original sound effects. */
export const resolveAlertSound = (sound) => {
  const uri = typeof sound?.uri === 'string' ? sound.uri : '';
  const replacement = uri.startsWith('speech://')
    ? {
        'speech://go': SOUNDS.bell,
        'speech://rest': SOUNDS.gong,
        'speech://start': SOUNDS.bell,
        'speech://complete': SOUNDS.chime,
      }[uri]
    : null;
  if (replacement) return { ...replacement };
  if (/^speech:\/\/count\/(?:[1-9]|10)$/.test(uri)) return { ...SOUNDS.tick };
  return sound;
};

export const resolveAlertConfig = (raw) => {
  const config = normalizeAlertConfig(raw);
  return {
    ...config,
    countdown: {
      ...config.countdown,
      mode: config.countdown.mode === 'voice' ? 'beep' : config.countdown.mode,
    },
    signals: Object.fromEntries(
      SIGNAL_KEYS.map((key) => [key, resolveAlertSound(config.signals[key])]),
    ),
  };
};

export const createAlertPreset = (name = 'hiit') => {
  const config = resolveAlertConfig({ version: 1, enabled: name !== 'silent' });
  if (name === 'boxing') {
    config.signals = {
      start: { ...SOUNDS.bell },
      rest: { ...SOUNDS.gong },
      work: { ...SOUNDS.bell },
      finish: { ...SOUNDS.bell },
    };
  } else if (name === 'beeps') {
    config.countdown.mode = 'beep';
    config.signals = {
      start: { ...SOUNDS.chime },
      rest: { ...SOUNDS.tick },
      work: { ...SOUNDS.chime },
      finish: { ...SOUNDS.chime },
    };
  }
  return config;
};

const countSound = () => ({ ...SOUNDS.tick });

const sameRun = (previous, next) =>
  previous && previous.startedAt === next.startedAt && previous.routine?.id === next.routine?.id;

const generation = (session) => Math.max(0, finite(session?.skippedPhases, 0));
const cueBase = (session) => `${session.startedAt}:${generation(session)}:${session.index}`;
const decorate = (config, details) => ({
  ...details,
  volume: config.volume,
  language: config.language,
});

const cueWindowMs = 500;
const phaseAgeMs = (session, phase) => phase.durationSec * 1000 - session.remainingMs;

/**
 * Return only cues relevant now, never a catch-up queue after a clock jump.
 * The consumer keeps a played-ID set for duplicate effects; IDs change when a
 * user skips backward and replays a phase. Pause/resume preserves count IDs.
 * A phase-entry signal takes precedence over a simultaneous countdown number.
 */
export const planSessionCues = (previous, next) => {
  if (!next || next.routine?.audioAlerts == null || !Array.isArray(next.timeline)) return [];
  const config = resolveAlertConfig(next.routine.audioAlerts);
  if (!config.enabled) return [];
  const same = sameRun(previous, next);
  const skipped = same && generation(previous) !== generation(next);
  if (next.status === 'completed') {
    // A skip to the end is not a completed workout; a late foreground update is silent.
    if (
      !same ||
      previous.status !== 'running' ||
      skipped ||
      !config.signals.finish ||
      !Number.isFinite(next.endedAt) ||
      !Number.isFinite(next.updatedAt) ||
      next.updatedAt - next.endedAt > cueWindowMs
    )
      return [];
    return [
      decorate(config, {
        id: `${cueBase(next)}:signal:finish`,
        kind: 'signal',
        signalKey: 'finish',
        sound: config.signals.finish,
      }),
    ];
  }
  if (
    next.audioPending ||
    next.status !== 'running' ||
    !Number.isFinite(next.remainingMs) ||
    next.remainingMs <= 0
  )
    return [];
  const phase = next.timeline[next.index];
  if (!phase || !['beforeStart', 'work', 'rest'].includes(phase.phase)) return [];
  const entered =
    !same ||
    previous.index !== next.index ||
    skipped ||
    (previous.audioPending && !next.audioPending && phaseAgeMs(next, phase) === 0);
  const age = phaseAgeMs(next, phase);
  if (entered && age >= 0 && age <= cueWindowMs && phase.phase !== 'beforeStart') {
    const firstWorkIndex = next.timeline.findIndex((item) => item.phase === 'work');
    const key = phase.phase === 'rest' ? 'rest' : next.index === firstWorkIndex ? 'start' : 'work';
    if (config.signals[key])
      return [
        decorate(config, {
          id: `${cueBase(next)}:signal:${key}`,
          kind: 'signal',
          signalKey: key,
          sound: config.signals[key],
        }),
      ];
  }
  if (skipped) return [];
  const scope = phase.phase === 'beforeStart' ? 'preparation' : phase.phase;
  const number = Math.ceil(next.remainingMs / 1000);
  if (
    config.countdown.mode === 'off' ||
    !config.countdown[scope] ||
    number < 1 ||
    number > config.countdown.seconds ||
    (!entered && Math.ceil(previous.remainingMs / 1000) === number)
  )
    return [];
  return [
    decorate(config, {
      id: `${cueBase(next)}:count:${number}`,
      kind: 'count',
      number,
      sound: countSound(),
    }),
  ];
};

/** A short sample independent of live workout playback. The caller owns cancellation. */
export const buildCuePreview = (raw, signalKey = 'start') => {
  const config = resolveAlertConfig(raw);
  if (!config.enabled || !SIGNAL_KEYS.includes(signalKey)) return [];
  // Preview the last three seconds even when the workout uses a longer countdown.
  const events = [];
  const scope = { start: 'preparation', rest: 'work', work: 'rest', finish: 'work' }[signalKey];
  const count =
    config.countdown.mode === 'off' || !config.countdown[scope]
      ? 0
      : Math.min(3, config.countdown.seconds);
  for (let number = count; number > 0; number -= 1)
    events.push(
      decorate(config, {
        atMs: (count - number) * 1000,
        kind: 'count',
        number,
        sound: countSound(),
      }),
    );
  if (config.signals[signalKey])
    events.push(
      decorate(config, {
        atMs: count * 1000,
        kind: 'signal',
        signalKey,
        sound: config.signals[signalKey],
      }),
    );
  return events;
};
