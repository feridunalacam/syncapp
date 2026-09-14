import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoundAudio, getPhaseMusicVolume } from '../src/domain/audio.js';

test('a per-round track takes precedence over both playlists', () => {
  const routine = {
    workoutPlaylistId: 'global',
    roundsData: [
      { workSong: { uri: 'file:///track.mp3', name: 'Local' }, workPlaylistId: 'round' },
    ],
  };
  const result = resolveRoundAudio(routine, 'work', 1, 'spotify');
  assert.equal(result.kind, 'track');
  assert.equal(result.platform, 'device');
  assert.equal(result.source.name, 'Local');
});
test('rest uses its own playlist and platform', () => {
  const result = resolveRoundAudio(
    {
      roundsData: [
        { workPlaylistId: 'focus', restPlaylistId: 'rest', restPlaylistPlatform: 'spotify' },
      ],
    },
    'rest',
    1,
    'device',
  );
  assert.equal(result.playlistId, 'rest');
  assert.equal(result.platform, 'spotify');
});
test('Spotify URI identifies legacy tracks even with an incorrect platform tag', () => {
  assert.equal(
    resolveRoundAudio(
      { roundsData: [{ workSong: { uri: 'spotify:track:example', platform: 'device' } }] },
      'work',
      1,
    ).platform,
    'spotify',
  );
});
test('web audio is played by the device audio service', () => {
  assert.equal(
    resolveRoundAudio(
      { roundsData: [{ workSong: { uri: 'https://example.org/audio.mp3', platform: 'url' } }] },
      'work',
      1,
    ).platform,
    'device',
  );
});
test('preparation uses the first Work source and empty rounds remain silent', () => {
  assert.equal(
    resolveRoundAudio({ workoutPlaylistId: 'focus' }, 'beforeStart', 0).playlistId,
    'focus',
  );
  assert.equal(resolveRoundAudio({}, 'beforeStart', 0), null);
  assert.equal(resolveRoundAudio({ roundsData: [{}] }, 'rest', 1), null);
});

test('phase volumes preserve zero and clamp invalid values', () => {
  assert.equal(getPhaseMusicVolume({}, 'beforeStart'), 50);
  assert.equal(getPhaseMusicVolume({}, 'work'), 100);
  assert.equal(getPhaseMusicVolume({ preparationVolume: 0 }, 'beforeStart'), 0);
  assert.equal(getPhaseMusicVolume({ workVolume: 70 }, 'work'), 70);
  assert.equal(getPhaseMusicVolume({ restVolume: 20 }, 'rest'), 20);
  assert.equal(getPhaseMusicVolume({ preparationVolume: -10 }, 'beforeStart'), 0);
  assert.equal(getPhaseMusicVolume({ workVolume: Infinity }, 'work'), 100);
});
