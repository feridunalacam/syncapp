import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useMusicSearch } from '../src/hooks/useMusicSearch.js';
import { distributePlaylist, normalizeDetectedMedia } from '../src/domain/musicLibrary.js';
import { readSpotifyPages } from '../src/services/spotify/library.js';
import { createMusicConnections } from '../src/lib/musicConnections.js';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function harness(t, service) {
  let hook;
  const settings = {
    services: { spotify: service },
    connectedPlatforms: { spotify: { connected: true, accessToken: 'test' } },
    refreshToken: async () => null,
  };
  function Harness() {
    hook = useMusicSearch(settings);
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => {
    await act(async () => root.unmount());
  });
  return {
    get hook() {
      return hook;
    },
  };
}
test('late search cannot replace a newer query', async (t) => {
  const first = deferred();
  const h = await harness(t, {
    search: async (_, query) => (query === 'old' ? first.promise : { tracks: [{ id: 'new' }] }),
  });
  let pending;
  await act(async () => {
    pending = h.hook.searchMusic('old', 'spotify');
  });
  await act(async () => {
    await h.hook.searchMusic('new', 'spotify');
    first.resolve({ tracks: [{ id: 'old' }] });
    await pending;
  });
  assert.equal(h.hook.searchResults[0].id, 'new');
});
test('closing or switching source invalidates pending playlist loads', async (t) => {
  const wait = deferred();
  const h = await harness(t, { getUserPlaylists: () => wait.promise });
  let pending;
  await act(async () => {
    pending = h.hook.loadPlaylists('spotify');
    h.hook.reset();
    wait.resolve([{ id: 'old' }]);
    await pending;
  });
  assert.deepEqual(h.hook.playlists, []);
  assert.equal(h.hook.loadingPlaylists, false);
});
test('playlist failure is shown separately from an empty playlist', async (t) => {
  const h = await harness(t, {
    getUserPlaylists: async () => {
      throw new Error('offline');
    },
  });
  await act(async () => {
    await h.hook.loadPlaylists('spotify');
  });
  assert.ok(h.hook.playlistError);
  assert.deepEqual(h.hook.playlists, []);
});
test('shuffle fills requested rounds and excludes unplayable tracks', () => {
  const a = { id: 'a', uri: 'spotify:track:a' },
    b = { id: 'b', uri: 'spotify:track:b' };
  const result = distributePlaylist([a, b, { id: 'bad' }], [1, 3, 5], () => 0);
  assert.deepEqual(Object.keys(result), ['1', '3', '5']);
  assert.notEqual(result[1].id, result[3].id);
  assert.equal(result[1].id, result[5].id);
  assert.equal(distributePlaylist([{ id: 'no-uri' }], [1]), null);
});
test('Spotify pagination never returns a partial library after a failed page', async () => {
  let calls = 0;
  await assert.rejects(
    readSpotifyPages('https://api.spotify.com/first', 'test', async () =>
      ++calls === 1
        ? { ok: true, json: async () => ({ items: [1], next: 'https://api.spotify.com/second' }) }
        : { ok: false, status: 401 },
    ),
    (error) => error.status === 401,
  );
  assert.equal(calls, 2);
});
test('browser media messages are normalized before rendering', () => {
  assert.deepEqual(
    normalizeDetectedMedia([
      { url: 'javascript:alert(1)' },
      { url: 'https://example.org/audio.mp3', name: { bad: true } },
      { url: 'https://example.org/audio.mp3', name: 'Track' },
    ]),
    [{ url: 'https://example.org/audio.mp3', name: 'Track' }],
  );
  assert.deepEqual(normalizeDetectedMedia({ bad: 'input' }), []);
});
const initial = {
  device: { connected: true },
  spotify: { connected: true, accessToken: 'old', refreshToken: 'refresh-old' },
};
test('simultaneous token refreshes share one request and preserve rotation', async () => {
  const wait = deferred();
  let calls = 0;
  const saved = [];
  const store = createMusicConnections({
    initial,
    save: async (next) => saved.push(next),
    onChange: () => {},
    services: {
      spotify: {
        getAccessToken: () => {
          calls++;
          return wait.promise;
        },
      },
    },
  });
  const a = store.refresh('spotify'),
    b = store.refresh('spotify');
  wait.resolve({ accessToken: 'new', refreshToken: 'refresh-new', expiresIn: 3600 });
  assert.deepEqual(await Promise.all([a, b]), ['new', 'new']);
  assert.equal(calls, 1);
  assert.equal(saved[0].spotify.refreshToken, 'refresh-new');
});
test('disconnect during refresh cannot recreate credentials', async () => {
  const wait = deferred();
  const store = createMusicConnections({
    initial,
    save: async () => {},
    onChange: () => {},
    services: { spotify: { getAccessToken: () => wait.promise } },
  });
  const refresh = store.refresh('spotify');
  await store.disconnect('spotify');
  wait.resolve({ accessToken: 'late' });
  assert.equal(await refresh, null);
  assert.equal(store.getState().spotify, undefined);
});
test('failed secure persistence does not report a successful connection', async () => {
  const store = createMusicConnections({
    initial: { device: initial.device },
    save: async () => {
      throw new Error('disk');
    },
    onChange: () => {},
    services: {},
  });
  await assert.rejects(store.connect('spotify', initial.spotify));
  assert.equal(store.getState().spotify, undefined);
});
test('a reconnect wins over an older in-flight token refresh', async () => {
  const wait = deferred();
  const store = createMusicConnections({
    initial,
    save: async () => {},
    onChange: () => {},
    services: { spotify: { getAccessToken: () => wait.promise } },
  });
  const old = store.refresh('spotify');
  await store.connect('spotify', { accessToken: 'other-account', refreshToken: 'other-refresh' });
  wait.resolve({ accessToken: 'late' });
  await old;
  assert.equal(store.getState().spotify.accessToken, 'other-account');
});

test('short access tokens are never treated as valid beyond their expiry', async () => {
  const { computeAccessTokenExpiresAt } = await import('../src/services/spotify/auth.js');
  assert.equal(computeAccessTokenExpiresAt(30, 1000), 1000);
  assert.equal(computeAccessTokenExpiresAt(3600, 1000), 3541000);
});

test('background playlist refresh keeps visible items until fresh results arrive', async (t) => {
  const next = deferred();
  let calls = 0;
  const h = await harness(t, {
    getUserPlaylists: () => (++calls === 1 ? [{ id: 'old' }] : next.promise),
  });
  await act(async () => {
    await h.hook.loadPlaylists('spotify');
  });
  let pending;
  await act(async () => {
    pending = h.hook.loadPlaylists('spotify', { preserveItems: true });
  });
  assert.equal(h.hook.playlists[0].id, 'old');
  assert.equal(h.hook.loadingPlaylists, true);
  await act(async () => {
    next.resolve([{ id: 'new' }]);
    await pending;
  });
  assert.equal(h.hook.playlists[0].id, 'new');
  assert.equal(h.hook.loadingPlaylists, false);
});
test('background refresh failure retains the previous list without hiding the error', async (t) => {
  let calls = 0;
  const h = await harness(t, {
    getUserPlaylists: async () => {
      if (++calls > 1) throw new Error('offline');
      return [{ id: 'cached' }];
    },
  });
  await act(async () => {
    await h.hook.loadPlaylists('spotify');
  });
  await act(async () => {
    await h.hook.loadPlaylists('spotify', { preserveItems: true });
  });
  assert.equal(h.hook.playlists[0].id, 'cached');
  assert.ok(h.hook.playlistError);
});
