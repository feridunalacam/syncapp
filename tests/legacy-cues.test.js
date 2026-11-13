import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const assetUrl = new URL('../src/services/alerts/assets.js', import.meta.url);
const assetsSource = readFileSync(assetUrl, 'utf8').replace(/^export /gm, '');
const expected = {
  'voices://beep_short': 'tick.wav',
  'voices://beep_long': 'long-beep.wav',
  'voices://tone_high': 'tick.wav',
  'voices://tone_low': 'long-beep.wav',
  'voices://bell': 'boxing-bell.wav',
  'voices://gong': 'gong.wav',
  'voices://boxing_bell': 'boxing-bell.wav',
  'voices://whistle': 'whistle.wav',
  'voices://buzzer': 'buzzer.wav',
  'voices://air_horn': 'air-horn.wav',
  'voices://countdown_321': 'tick.wav',
  'voices://countdown_go': 'tick.wav',
  'voices://countdown_start': 'tick.wav',
  'voices://success': 'finish-chime.wav',
};
const registry = new Script(
  `${assetsSource}\nglobalThis.registry = LEGACY_CUE_ASSETS;`,
).runInNewContext({ require: (path) => path });

function wav(filename) {
  const bytes = readFileSync(new URL(`../assets/sounds/cues/${filename}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'fmt ') format = chunk;
    if (type === 'data') data = chunk;
    offset += 8 + length + (length % 2);
  }
  assert.ok(format && data, `${filename} must contain playable PCM data`);
  assert.equal(format.readUInt16LE(0), 1, 'Uncompressed PCM');
  assert.equal(format.readUInt16LE(2), 1, 'Mono');
  assert.equal(format.readUInt32LE(4), 44100);
  assert.equal(format.readUInt16LE(14), 16);
  return { bytes, data, duration: data.length / 2 / 44100 };
}

test('all fourteen saved cue URIs remain available and resolve to real original WAV assets', () => {
  assert.deepEqual(Object.keys(registry).sort(), Object.keys(expected).sort());
  for (const [uri, filename] of Object.entries(expected)) {
    assert.equal(registry[uri], `../../../assets/sounds/cues/${filename}`);
    assert.ok(readFileSync(new URL(registry[uri], assetUrl)).length > 44);
    assert.ok(wav(filename).duration > 0);
  }
});

test('new compatibility effects are distinct bounded PCM with quiet edges and no clipping', () => {
  const durations = {
    'long-beep.wav': 0.8,
    'whistle.wav': 0.75,
    'buzzer.wav': 0.65,
    'air-horn.wav': 0.85,
  };
  const hashes = new Set();
  for (const [filename, duration] of Object.entries(durations)) {
    const sound = wav(filename);
    assert.equal(sound.duration, duration);
    assert.equal(sound.data.readInt16LE(0), 0);
    assert.equal(sound.data.readInt16LE(sound.data.length - 2), 0);
    let peak = 0,
      energy = 0;
    for (let index = 0; index < sound.data.length; index += 2) {
      const sample = sound.data.readInt16LE(index);
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(peak > 15000 && peak <= 0.61 * 32767, 'Audible normalized peak below clipping');
    assert.ok(energy > 0, 'The cue must not be silent');
    hashes.add(createHash('sha256').update(sound.bytes).digest('hex'));
  }
  assert.equal(hashes.size, 4, 'Different legacy names have distinct generated effects');
});

test('the actual legacy countdown player plays every saved URI and releases it on completion', async () => {
  const source = readFileSync(
    new URL('../src/utils/countdownSoundPlayer.js', import.meta.url),
    'utf8',
  )
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/^export default .*;?\n?/gm, '')
    .replace(/^export /gm, '');
  const sounds = [];
  const context = {
    __DEV__: false,
    require: (path) => path,
    Audio: {
      setAudioModeAsync: async () => {},
      Sound: {
        createAsync: async (source) => {
          const sound = {
            source,
            plays: 0,
            unloads: 0,
            setOnPlaybackStatusUpdate(callback) {
              this.callback = callback;
            },
            async playAsync() {
              this.plays++;
            },
            async unloadAsync() {
              this.unloads++;
            },
          };
          sounds.push(sound);
          return { sound };
        },
      },
    },
  };
  new Script(
    `${assetsSource}\n${source}\nglobalThis.player = new CountdownSoundPlayer();`,
  ).runInNewContext(context);
  for (const [uri, filename] of Object.entries(expected)) {
    await context.player.play(uri);
    const sound = sounds.at(-1);
    assert.equal(sound.source, `../../../assets/sounds/cues/${filename}`);
    assert.equal(sound.plays, 1);
    sound.callback({ didJustFinish: true });
    await Promise.resolve();
    assert.equal(sound.unloads, 1);
  }
  await context.player.cleanup();
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settle = () => new Promise(setImmediate);
function barrierHarness(options = {}) {
  const source = readFileSync(
    new URL('../src/utils/countdownSoundPlayer.js', import.meta.url),
    'utf8',
  )
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/^export default .*;?\n?/gm, '')
    .replace(/^export /gm, '');
  const sounds = [];
  const context = {
    __DEV__: false,
    require: (path) => path,
    Audio: {
      setAudioModeAsync: async () => {},
      Sound: {
        async createAsync(source, status) {
          await options.load?.(source);
          const sound = {
            source,
            status,
            plays: 0,
            unloads: 0,
            setOnPlaybackStatusUpdate(callback) {
              this.callback = callback;
            },
            async playAsync() {
              this.plays++;
            },
            async unloadAsync() {
              this.unloads++;
              return await options.unload?.(this);
            },
          };
          sounds.push(sound);
          return { sound };
        },
      },
    },
  };
  new Script(
    `${assetsSource}\n${source}\nglobalThis.player = new CountdownSoundPlayer();`,
  ).runInNewContext(context);
  return { player: context.player, sounds };
}

test('legacy native still-loaded status blocks replacement until a checked retry succeeds', async () => {
  let status = { isLoaded: true };
  const h = barrierHarness({ unload: () => status });
  await h.player.play('voices://gong');
  await assert.rejects(h.player.stop(), /did not stop/);
  await assert.rejects(h.player.play('voices://boxing_bell'), /did not stop/);
  assert.equal(h.sounds.length, 1);
  status = { isLoaded: false };
  await h.player.stop();
  await h.player.play('voices://boxing_bell');
  assert.equal(h.sounds.length, 2);
  await h.player.cleanup();
});

test('concurrent legacy stops and cleanup await one delayed native unload', async () => {
  const nativeStop = deferred();
  const h = barrierHarness({ unload: () => nativeStop.promise });
  await h.player.play('voices://gong');
  const completed = [];
  const stops = [h.player.stop(), h.player.stop(), h.player.cleanup()].map((pending, index) =>
    pending.then(() => completed.push(index)),
  );
  await settle();
  const earlyCompletions = [...completed];
  const nativeCalls = h.sounds[0].unloads;
  nativeStop.resolve();
  await Promise.all(stops);
  assert.deepEqual(earlyCompletions, [], 'no caller can authorize music before native silence');
  assert.equal(nativeCalls, 1, 'all callers share the in-flight native unload');
  assert.equal(completed.length, 3);
});

test('failed legacy unload blocks replacement playback and remains available for acknowledged retry', async () => {
  let failing = true;
  const h = barrierHarness({
    unload: () => {
      if (failing) throw new Error('Native unload failed');
    },
  });
  await h.player.play('voices://gong');
  await assert.rejects(h.player.stop(), /Native unload failed/);
  await assert.rejects(h.player.play('voices://bell'), /Native unload failed/);
  assert.equal(h.sounds.length, 1, 'unknown old playback must not be overlapped by a new sound');
  failing = false;
  await h.player.stop();
  assert.equal(h.sounds[0].unloads, 3, 'failed native ownership survives until a successful retry');
  await h.player.play('voices://bell');
  assert.equal(h.sounds[1].plays, 1);
  await h.player.cleanup();
});

test('legacy replacement waits for retirement and only the latest waiting choice can play', async () => {
  const nativeStop = deferred();
  const h = barrierHarness({ unload: () => nativeStop.promise });
  await h.player.play('voices://gong');
  const stopped = h.player.stop();
  const superseded = h.player.play('voices://bell');
  const latest = h.player.play('voices://whistle');
  await settle();
  const soundsBeforeAcknowledgement = h.sounds.length;
  const unloadCallsBeforeAcknowledgement = h.sounds[0].unloads;
  nativeStop.resolve();
  await Promise.all([stopped, superseded, latest]);
  assert.equal(soundsBeforeAcknowledgement, 1);
  assert.equal(unloadCallsBeforeAcknowledgement, 1);
  assert.equal(h.sounds.length, 2);
  assert.equal(h.sounds[1].source, '../../../assets/sounds/cues/whistle.wav');
  assert.equal(h.sounds[1].plays, 1);
  await h.player.cleanup();
});

test('a cancelled silent legacy load retains failed native disposal for later recovery', async () => {
  const loaded = deferred();
  let failing = true;
  const h = barrierHarness({
    load: () => loaded.promise,
    unload: () => {
      if (failing) throw new Error('Late native unload failed');
    },
  });
  const playing = h.player.play('voices://gong');
  await settle();
  await h.player.stop();
  const rejected = assert.rejects(playing, /Late native unload failed/);
  loaded.resolve();
  await rejected;
  assert.equal(h.sounds[0].status.shouldPlay, false);
  assert.equal(h.sounds[0].plays, 0);
  await assert.rejects(h.player.play('voices://bell'), /Late native unload failed/);
  assert.equal(h.sounds.length, 1);
  failing = false;
  await h.player.cleanup();
  await h.player.play('voices://bell');
  assert.equal(h.sounds[1].plays, 1);
  await h.player.cleanup();
});

test('automatic legacy completion retirement remains part of the next music handover barrier', async () => {
  const nativeStop = deferred();
  const h = barrierHarness({ unload: () => nativeStop.promise });
  await h.player.play('voices://gong');
  h.sounds[0].callback({ didJustFinish: true });
  let handoverReady = false;
  const stopped = h.player.stop().then(() => {
    handoverReady = true;
  });
  await settle();
  const readyBeforeNativeAcknowledgement = handoverReady;
  nativeStop.resolve();
  await stopped;
  assert.equal(readyBeforeNativeAcknowledgement, false);
  assert.equal(h.sounds[0].unloads, 1);
});
