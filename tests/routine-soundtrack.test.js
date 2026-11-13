import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoutineSoundtrack,
  soundtrackPlaybackItem,
} from '../src/domain/routineSoundtrack.js';
import { normalizeRoutine, buildTimeline } from '../src/domain/routines.js';
import { resolveRoundAudio } from '../src/domain/audio.js';

const playlist = (extra = {}) => ({
  platform: 'appleMusic',
  kind: 'playlist',
  id: 'p.library-1',
  name: 'My music',
  artist: 'Curator',
  image: 'https://example.test/cover.jpg',
  shuffle: true,
  ...extra,
});

test('old routines gain no soundtrack and keep their timed assignments and timeline', () => {
  const old = {
    id: 'old',
    name: 'Legacy',
    rounds: 2,
    workSec: 40,
    restSec: 12,
    workoutPlaylistId: 'legacy-playlist',
    restPlaylistId: 'legacy-rest',
    platform: 'spotify',
    roundsData: [{ workSec: 55, restSec: 9, workSong: { uri: 'file:///owned.wav' } }],
  };
  const normalized = normalizeRoutine(old);
  assert.equal(normalized.soundtrack, null);
  assert.equal(normalizeRoutine({ ...old, soundtrack: null }).soundtrack, null);
  assert.equal(normalized.workoutPlaylistId, old.workoutPlaylistId);
  assert.equal(resolveRoundAudio(normalized, 'work', 2).playlistId, old.workoutPlaylistId);
  assert.equal(resolveRoundAudio(normalized, 'work', 1).source.uri, 'file:///owned.wav');
  assert.deepEqual(buildTimeline(normalized), buildTimeline({ ...old, soundtrack: playlist() }));
});

test('library and catalog playlists retain exact IDs and independent shuffle', () => {
  for (const id of ['p.library-1', 'pl.catalog_2']) {
    const input = Object.freeze(playlist({ id, name: '  Workout mix  ' }));
    const normalized = normalizeRoutineSoundtrack(input);
    assert.equal(normalized.id, id);
    assert.equal(normalized.name, 'Workout mix');
    assert.equal(normalized.shuffle, true);
    assert.notEqual(normalized, input);
    const item = soundtrackPlaybackItem(normalized);
    assert.equal(item.type, 'playlist');
    assert.equal(item.id, id);
    assert.equal(item.uri, undefined);
  }
});

test('catalog and library tracks derive native song URIs and never enable playlist shuffle', () => {
  for (const id of ['1234567890', 'i.Library_7-9']) {
    const normalized = normalizeRoutineSoundtrack(
      playlist({ kind: 'track', id, uri: `apple-music:song:${id}` }),
    );
    assert.equal(normalized.shuffle, false);
    assert.equal(normalized.uri, undefined, 'Stored identity has one source of truth');
    assert.equal(soundtrackPlaybackItem(normalized).uri, `apple-music:song:${id}`);
    assert.equal(soundtrackPlaybackItem(normalized).type, 'track');
  }
});

test('malformed or conflicting selection identities normalize to null without inspecting extra fields', () => {
  for (const invalid of [
    undefined,
    null,
    [],
    'p.one',
    7,
    playlist({ platform: 'spotify' }),
    playlist({ kind: 'album' }),
    playlist({ id: '' }),
    playlist({ id: 'p.' }),
    playlist({ id: '123' }),
    playlist({ id: 'p.bad/segment' }),
    playlist({ id: ' p.one' }),
    playlist({ id: 'p.' + 'x'.repeat(200) }),
    playlist({ kind: 'track', id: 'pl.playlist' }),
    playlist({ kind: 'track', id: '123', uri: 'apple-music:song:456' }),
    playlist({ kind: 'track', id: '123', uri: 'spotify:track:123' }),
    playlist({ uri: 'apple-music:song:123' }),
  ]) {
    assert.equal(normalizeRoutineSoundtrack(invalid), null);
    assert.equal(soundtrackPlaybackItem(invalid), null);
    assert.equal(normalizeRoutine({ soundtrack: invalid }).soundtrack, null);
  }
});

test('saved metadata is bounded and whitelisted; shuffle accepts only boolean true for playlists', () => {
  const normalized = normalizeRoutineSoundtrack(
    playlist({
      name: 'n'.repeat(500),
      artist: 'a'.repeat(500),
      accessToken: 'private',
      refreshToken: 'private',
      authentication: { secret: 'private' },
      unknown: { uri: 'file:///private.wav' },
    }),
  );
  assert.equal(normalized.name.length, 200);
  assert.equal(normalized.artist.length, 200);
  assert.deepEqual(Object.keys(normalized).sort(), [
    'artist',
    'id',
    'image',
    'kind',
    'name',
    'platform',
    'shuffle',
  ]);
  assert.equal(JSON.stringify(normalized).includes('private'), false);
  for (const shuffle of [undefined, null, false, 1, 'true', 'false', {}])
    assert.equal(normalizeRoutineSoundtrack(playlist({ shuffle })).shuffle, false);
});

test('only bounded credential-free HTTPS artwork survives normalization', () => {
  for (const image of [
    null,
    {},
    '',
    'file:///private.jpg',
    'http://example.test/a.jpg',
    'javascript:alert(1)',
    'https:example.test/a.jpg',
    'https://bad host/a.jpg',
    'https://user:secret@example.test/a.jpg',
    'https://user@example.test/a.jpg',
    'https://example.test/' + 'x'.repeat(2048),
  ])
    assert.equal(normalizeRoutineSoundtrack(playlist({ image })).image, null);
  assert.equal(
    normalizeRoutineSoundtrack(playlist({ image: '  https://example.test/a.jpg  ' })).image,
    'https://example.test/a.jpg',
  );
});

test('normalization and playback conversion are idempotent and do not mutate saved selection', () => {
  const saved = normalizeRoutineSoundtrack(playlist());
  assert.deepEqual(normalizeRoutineSoundtrack(saved), saved);
  const item = soundtrackPlaybackItem(saved);
  item.shuffle = false;
  assert.equal(saved.shuffle, true);
  assert.equal(
    normalizeRoutine({ soundtrack: { platform: 'device', id: 'local' } }).soundtrack,
    null,
  );
});
