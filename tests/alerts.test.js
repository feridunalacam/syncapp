import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAlertConfig,
  resolveAlertConfig,
  resolveAlertSound,
  createAlertPreset,
  planSessionCues,
  buildCuePreview,
} from '../src/domain/alerts.js';
import {
  createSession,
  advanceSession,
  pauseSession,
  resumeSession,
  skipSession,
  stopSession,
  holdForAudio,
  releaseAudioHold,
} from '../src/domain/workout.js';

const makeSession = (changes = {}) =>
  createSession(
    {
      id: 'cue-test',
      name: 'Intervals',
      rounds: 2,
      workSec: 10,
      restSec: 5,
      audioAlerts: createAlertPreset('hiit'),
      ...changes,
    },
    1000,
  );
const onlyCue = (previous, next) => {
  const cues = planSessionCues(previous, next);
  assert.equal(cues.length, 1);
  return cues[0];
};

test('legacy and malformed configurations do not opt into new audio', () => {
  for (const value of [
    null,
    undefined,
    false,
    'hiit',
    [],
    { enabled: 'yes' },
    { version: 99, enabled: true },
  ])
    assert.equal(normalizeAlertConfig(value).enabled, false);
  assert.deepEqual(planSessionCues(null, makeSession({ audioAlerts: null })), []);
  assert.deepEqual(planSessionCues(null, null), []);
  assert.deepEqual(planSessionCues(null, {}), []);
});

test('normalization clamps volume and duration and drops unsupported sound sources', () => {
  const config = normalizeAlertConfig({
    enabled: true,
    volume: 130,
    language: 'unknown',
    countdown: { mode: 'unknown', seconds: -5, work: false },
    signals: {
      start: { uri: 'javascript:alert(1)' },
      rest: { uri: 'https://example.com/sound.mp3', platform: 'spotify' },
      work: { uri: 'voices://boxing_bell', duration: -1 },
      finish: { uri: 'file:///local/chime.wav', duration: Infinity },
    },
  });
  assert.equal(config.volume, 100);
  assert.equal(config.language, 'en-US');
  assert.equal(config.countdown.seconds, 3);
  assert.equal(config.countdown.mode, 'voice');
  assert.equal(config.countdown.work, false);
  assert.equal(config.signals.start, null);
  assert.equal(config.signals.rest, null);
  assert.equal(config.signals.work.duration, 0);
  assert.equal(config.signals.finish.duration, 1);
  assert.equal(config.signals.finish.platform, 'device');
  assert.equal(normalizeAlertConfig({ volume: -20 }).volume, 0);
});

test('presets are independent configurations and boxing selects real sound effects', () => {
  const boxing = createAlertPreset('boxing');
  assert.equal(boxing.signals.start.uri, 'voices://cue_boxing_bell');
  assert.equal(boxing.signals.rest.uri, 'voices://cue_gong');
  assert.equal(createAlertPreset('beeps').countdown.mode, 'beep');
  assert.equal(createAlertPreset('silent').enabled, false);
  boxing.signals.start.name = 'Changed';
  assert.equal(createAlertPreset('boxing').signals.start.name, 'Boxing bell');
  assert.equal(createAlertPreset('hiit').signals.work.uri, 'voices://cue_boxing_bell');
});

test('preparation ticks actual remaining seconds then first work rings the bell', () => {
  let previous = makeSession({ countdownBeforeStartDuration: 3 });
  assert.equal(onlyCue(null, previous).sound.uri, 'voices://cue_tick');
  for (const [now, number] of [
    [2000, 2],
    [3000, 1],
  ]) {
    const next = advanceSession(previous, now);
    assert.equal(onlyCue(previous, next).number, number);
    previous = next;
  }
  const work = advanceSession(previous, 4000);
  assert.equal(onlyCue(previous, work).sound.uri, 'voices://cue_boxing_bell');
});

test('200 ms ticks emit one cue at each countdown boundary', () => {
  let previous = makeSession();
  const numbers = [];
  const ids = [];
  for (let now = 1200; now <= 10800; now += 200) {
    const next = advanceSession(previous, now);
    for (const cue of planSessionCues(previous, next)) {
      numbers.push(cue.number);
      ids.push(cue.id);
    }
    previous = next;
  }
  assert.deepEqual(numbers, [3, 2, 1]);
  assert.equal(new Set(ids).size, 3);
});

test('pause and resume do not repeat a countdown tick', () => {
  const initial = makeSession();
  const three = advanceSession(initial, 8000);
  const cue = onlyCue(initial, three);
  const paused = pauseSession(three, 8200);
  assert.deepEqual(planSessionCues(three, paused), []);
  const resumed = resumeSession(paused, 90000);
  assert.deepEqual(planSessionCues(paused, resumed), []);
  const sameNumber = advanceSession(resumed, 90200);
  assert.deepEqual(planSessionCues(resumed, sameNumber), []);
  const two = advanceSession(sameNumber, 90800);
  assert.equal(onlyCue(sameNumber, two).number, 2);
  assert.equal(onlyCue(initial, three).id, cue.id);
});

test('a clock jump emits the current number only, never three stale countdowns', () => {
  const previous = makeSession();
  const next = advanceSession(previous, 10200);
  const cue = onlyCue(previous, next);
  assert.equal(cue.number, 1);
  assert.equal(cue.sound.uri, 'voices://cue_tick');
});

test('catch-up across phases does not announce a late start signal', () => {
  const previous = makeSession();
  const next = advanceSession(previous, 18800);
  assert.equal(next.index, 2);
  assert.deepEqual(planSessionCues(previous, next), []);
  const nearEnd = advanceSession(previous, 24700);
  assert.equal(onlyCue(previous, nearEnd).number, 2);
});

test('transition signals refer to the newly entered phase', () => {
  const first = makeSession();
  assert.equal(onlyCue(null, first).signalKey, 'start');
  const rest = advanceSession(first, 11000);
  assert.equal(onlyCue(first, rest).sound.uri, 'voices://cue_gong');
  const work = advanceSession(rest, 16000);
  assert.equal(onlyCue(rest, work).sound.uri, 'voices://cue_boxing_bell');
  assert.deepEqual(planSessionCues(work, advanceSession(work, 16200)), []);
});

test('short phases never overlap their entry signal with a count', () => {
  const first = makeSession({ rounds: 2, workSec: 2, restSec: 1 });
  assert.equal(onlyCue(null, first).signalKey, 'start');
  const lastSecond = advanceSession(first, 2000);
  assert.equal(onlyCue(first, lastSecond).number, 1);
  const rest = advanceSession(lastSecond, 3000);
  assert.equal(onlyCue(lastSecond, rest).signalKey, 'rest');
  const second = advanceSession(rest, 4000);
  assert.equal(onlyCue(rest, second).signalKey, 'work');
});

test('zero-rest routines announce the next work phase and finish without an invented rest', () => {
  const first = makeSession({ rounds: 2, workSec: 2, restSec: 0 });
  const second = advanceSession(first, 3000);
  assert.equal(onlyCue(first, second).signalKey, 'work');
  const one = advanceSession(second, 4000);
  assert.equal(onlyCue(second, one).number, 1);
  const finish = advanceSession(one, 5000);
  assert.equal(onlyCue(one, finish).signalKey, 'finish');
  assert.deepEqual(planSessionCues(finish, finish), []);
});

test('manual skip selects the new phase signal and skipped finish stays silent', () => {
  const first = advanceSession(makeSession(), 10200);
  const rest = skipSession(first, 1, 10200);
  const cue = onlyCue(first, rest);
  assert.equal(cue.signalKey, 'rest');
  assert.equal(cue.kind, 'signal');
  const last = skipSession(rest, 1, 10200);
  const finish = skipSession(last, 1, 10200);
  assert.deepEqual(planSessionCues(last, finish), []);
});

test('skipping backward gives the replayed phase a new cue identity', () => {
  const first = makeSession();
  const firstCue = onlyCue(null, first);
  const rest = advanceSession(first, 11000);
  const replay = skipSession(rest, -1, 11000);
  const replayCue = onlyCue(rest, replay);
  assert.equal(firstCue.sound.uri, replayCue.sound.uri);
  assert.notEqual(firstCue.id, replayCue.id);
});

test('paused skips, aborts and late completion do not emit signals', () => {
  const first = makeSession();
  const paused = pauseSession(first, 2000);
  const skipped = skipSession(paused, 1, 3000);
  assert.deepEqual(planSessionCues(paused, skipped), []);
  assert.deepEqual(planSessionCues(first, stopSession(first, 2000)), []);
  assert.deepEqual(planSessionCues(first, advanceSession(first, 90000)), []);
});

test('countdown switches and explicit empty signals are respected', () => {
  const config = createAlertPreset('hiit');
  config.countdown.work = false;
  config.signals.start = null;
  const first = makeSession({ audioAlerts: config });
  assert.deepEqual(planSessionCues(null, first), []);
  assert.deepEqual(planSessionCues(first, advanceSession(first, 8000)), []);
  config.countdown.work = true;
  config.countdown.mode = 'beep';
  const beeps = makeSession({ audioAlerts: config });
  assert.equal(onlyCue(beeps, advanceSession(beeps, 8000)).sound.uri, 'voices://cue_tick');
  config.volume = 0;
  const muted = makeSession({ audioAlerts: config });
  assert.equal(onlyCue(muted, advanceSession(muted, 8000)).volume, 0);
});

test('zero effects volume mutes persisted spoken settings in every phase and preview', () => {
  const saved = normalizeAlertConfig({ enabled: true, volume: 0 });
  assert.equal(saved.countdown.mode, 'voice');
  assert.equal(saved.signals.start.uri, 'speech://go');
  const before = structuredClone(saved);
  const first = makeSession({ audioAlerts: saved });
  assert.equal(onlyCue(null, first).volume, 0);
  const countdown = advanceSession(first, 8000);
  assert.equal(onlyCue(first, countdown).sound.uri, 'voices://cue_tick');
  assert.equal(onlyCue(first, countdown).volume, 0);
  const rest = advanceSession(countdown, 11000);
  assert.equal(onlyCue(countdown, rest).volume, 0);
  const last = advanceSession(rest, 25000);
  const finished = advanceSession(last, 26000);
  assert.equal(onlyCue(last, finished).volume, 0);
  assert.ok(buildCuePreview(saved).every((cue) => cue.volume === 0));
  assert.deepEqual(saved, before, 'playback and preview must not rewrite saved settings');
  assert.deepEqual(
    planSessionCues(null, makeSession({ audioAlerts: createAlertPreset('silent') })),
    [],
  );
});

test('preview is a cancellable three-second plan with configured language and effect volume', () => {
  const config = createAlertPreset('boxing');
  config.volume = 65;
  config.language = 'tr-TR';
  config.countdown.seconds = 10;
  const plan = buildCuePreview(config, 'rest');
  assert.deepEqual(
    plan.map((cue) => cue.atMs),
    [0, 1000, 2000, 3000],
  );
  assert.deepEqual(
    plan.map((cue) => cue.sound.uri),
    ['voices://cue_tick', 'voices://cue_tick', 'voices://cue_tick', 'voices://cue_gong'],
  );
  assert.ok(plan.every((cue) => cue.language === 'tr-TR'));
  assert.deepEqual(
    plan.map((cue) => cue.volume),
    [65, 65, 65, 65],
  );
  config.volume = 0;
  assert.deepEqual(
    buildCuePreview(config, 'rest').map((cue) => cue.volume),
    [0, 0, 0, 0],
  );
  config.countdown.work = false;
  assert.equal(buildCuePreview(config, 'rest').length, 1);
  assert.equal(buildCuePreview(config, 'rest')[0].atMs, 0);
  assert.deepEqual(buildCuePreview(createAlertPreset('silent'), 'rest'), []);
  assert.deepEqual(buildCuePreview(config, 'unknown'), []);
});

test('countdown and Go wait for audio readiness without losing the entry signal', () => {
  const first = makeSession();
  const waiting = holdForAudio(first, 1000, true);
  assert.deepEqual(planSessionCues(null, waiting), []);
  const ready = releaseAudioHold(waiting, 3400);
  assert.equal(onlyCue(waiting, ready).signalKey, 'start');
  const next = advanceSession(ready, 3500);
  assert.deepEqual(planSessionCues(ready, next), []);
});

test('a paused mid-interval resume does not replay the entry command', () => {
  const first = makeSession();
  const paused = pauseSession(first, 3000);
  const waiting = holdForAudio(resumeSession(paused, 6000), 6000);
  const ready = releaseAudioHold(waiting, 8000);
  assert.deepEqual(planSessionCues(waiting, ready), []);
});

test('all fourteen saved speech URIs resolve to original effects without changing stored data', () => {
  const expected = [
    ...Array.from({ length: 10 }, (_, i) => [`speech://count/${i + 1}`, 'voices://cue_tick']),
    ['speech://go', 'voices://cue_boxing_bell'],
    ['speech://rest', 'voices://cue_gong'],
    ['speech://start', 'voices://cue_boxing_bell'],
    ['speech://complete', 'voices://cue_chime'],
  ];
  for (const [uri, effect] of expected) {
    const saved = Object.freeze({ uri, name: 'Saved spoken choice', platform: 'speech' });
    assert.equal(resolveAlertSound(saved).uri, effect);
    assert.equal(saved.uri, uri);
  }
  const saved = normalizeAlertConfig({ enabled: true, language: 'tr-TR' });
  const before = structuredClone(saved);
  const effective = resolveAlertConfig(saved);
  assert.equal(effective.countdown.mode, 'beep');
  assert.ok(Object.values(effective.signals).every((sound) => sound.uri.startsWith('voices://')));
  assert.deepEqual(saved, before);
  for (const uri of ['file:///my-cue.wav', 'https://example.com/cue.mp3', 'voices://buzzer']) {
    const custom = { uri, name: 'My cue' };
    assert.equal(resolveAlertSound(custom), custom);
  }
  assert.equal(resolveAlertSound(null), null);
  for (const name of ['hiit', 'boxing', 'beeps', 'silent']) {
    const preset = createAlertPreset(name);
    assert.notEqual(preset.countdown.mode, 'voice');
    assert.ok(Object.values(preset.signals).every((sound) => !sound?.uri.startsWith('speech://')));
  }
});
