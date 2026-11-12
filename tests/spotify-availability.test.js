import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import {
  spotifyAvailable,
  SPOTIFY_UNAVAILABLE_MESSAGE,
} from '../src/services/spotify/availability.js';
import { createCommandQueue } from '../src/services/spotify/queue.js';

test('release and preview cannot expose owner-only Spotify even with an enabled flag', () => {
  for (const dev of [true, false]) {
    for (const profile of ['preview', 'production']) {
      assert.equal(spotifyAvailable({ dev, profile, enabled: 'true' }), false);
    }
  }
  assert.equal(spotifyAvailable({ dev: false, enabled: 'true' }), false);
  assert.equal(spotifyAvailable({ dev: true, profile: 'development' }), true);
  assert.equal(spotifyAvailable({ dev: true, enabled: 'false' }), false);
});

const source = readFileSync(new URL('../src/services/spotify/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default spotifyService;', 'globalThis.service = spotifyService;');

function loadService(available) {
  const calls = [];
  const api = new Proxy(
    {},
    {
      get:
        (_object, method) =>
        async (...args) => {
          calls.push({ method, args });
          return { success: true };
        },
    },
  );
  const context = {
    SPOTIFY_AVAILABLE: available,
    SPOTIFY_UNAVAILABLE_MESSAGE,
    spotifyAPI: api,
    createCommandQueue,
  };
  new Script(source).runInNewContext(context);
  return { service: context.service, calls };
}

test('disabled Spotify blocks every service network entry point, including refresh and reads', async () => {
  const { service, calls } = loadService(false);
  for (const operation of Object.values(service)) {
    const result = await operation('retained-token', 'retained-selection');
    assert.equal(result.success, false);
    assert.equal(result.code, 'SPOTIFY_UNAVAILABLE');
    assert.equal(result.error, SPOTIFY_UNAVAILABLE_MESSAGE);
  }
  assert.equal(calls.length, 0);
});

test('owner development service still dispatches reads and serialized playback commands', async () => {
  const { service, calls } = loadService(true);
  await service.getDevices('token');
  await service.playTrack('token', 'spotify:track:example', 'device');
  assert.deepEqual(
    calls.map(({ method }) => method),
    ['getDevices', 'playTrack'],
  );
});
