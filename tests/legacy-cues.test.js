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
