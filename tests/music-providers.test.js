import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';
import { MUSIC_PROVIDERS, resolveMusicLink } from '../src/services/music/providers.js';
import { useMusicSearch } from '../src/hooks/useMusicSearch.js';
import { resolveRoundAudio } from '../src/domain/audio.js';
import { createMusicConnections } from '../src/lib/musicConnections.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const authorized = { status: 'authorized', canPlayCatalogContent: true };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('every external music provider has a validated official home link', () => {
  for (const provider of Object.values(MUSIC_PROVIDERS)) {
    assert.equal(resolveMusicLink('', provider.id).provider.id, provider.id);
    assert.equal(resolveMusicLink(provider.url).provider.id, provider.id);
  }
  assert.equal(MUSIC_PROVIDERS.youtubeMusic.mode, 'external');
});

test('shared music links preserve content identity and reject lookalikes and unsafe URLs', () => {
  const link = 'https://music.youtube.com/playlist?list=PL123&si=abc';
  assert.equal(resolveMusicLink(link).url, link);
  assert.equal(
    resolveMusicLink('https://music.apple.com/tr/album/test/123?i=456').provider.id,
    'appleMusic',
  );
  for (const input of [
    'javascript:alert(1)',
    'file:///song.mp3',
    'http://music.youtube.com/',
    'https://music.youtube.com.evil.example/',
    'https://evil.example/?next=https://music.apple.com/',
    'https://music.apple.com@evil.example/',
    'https://user:pass@music.apple.com/',
    'https://music.apple.com:8443/',
    'https://accounts.google.com/',
    null,
    42,
    'a'.repeat(2049),
  ])
    assert.equal(resolveMusicLink(input), null, String(input));
  assert.equal(resolveMusicLink(link, 'appleMusic'), null);
});

test('an older native build or another platform cannot start an Apple Music connection', async () => {
  for (const native of [null, { supported: false }]) {
    const service = createAppleMusicService(native);
    assert.equal(service.available, false);
    await assert.rejects(service.authorize(), (error) => error.code === 'unavailable');
  }
});

test('Apple authorization saves only a native connection marker and never exports MusicKit tokens', async () => {
  let authorizations = 0;
  const service = createAppleMusicService({
    supported: true,
    authorize: async () => {
      authorizations++;
      return authorized;
    },
    getConnectionState: async () => authorized,
  });
  assert.deepEqual(await service.getAccessToken(), { accessToken: 'native:appleMusic' });
  assert.equal(authorizations, 0, 'reading an existing connection must never prompt');
  assert.deepEqual(await service.authorize(), { authentication: 'native' });
  assert.equal(authorizations, 1);
  assert.equal(service.allowsLocalCues, false);
  assert.equal(service.setVolume, undefined, 'MusicKit uses device volume');
});

for (const [state, code] of [
  [{ status: 'denied' }, 'denied'],
  [{ status: 'restricted' }, 'restricted'],
  [{ status: 'notDetermined' }, 'denied'],
  [{ status: 'authorized', canPlayCatalogContent: false }, 'subscription'],
])
  test(`Apple Music ${code} cannot become a connected account`, async () => {
    const service = createAppleMusicService({ supported: true, authorize: async () => state });
    await assert.rejects(
      service.authorize(),
      (error) => error.code === code && !!error.userMessage,
    );
  });

test('provider failures never expose raw native errors or credentials', async () => {
  const service = createAppleMusicService({
    supported: true,
    search: async () => {
      throw new Error('private-token');
    },
  });
  await assert.rejects(service.search('native', 'hello'), (error) => {
    assert.doesNotMatch(error.message, /private-token/);
    return !!error.userMessage;
  });
});

test('Apple Music rejects foreign track URIs before contacting the native player', async () => {
  let calls = 0;
  const service = createAppleMusicService({
    supported: true,
    playTrack: async () => {
      calls++;
    },
  });
  for (const uri of [
    'https://music.apple.com/test',
    'spotify:track:123',
    'file:///test.mp3',
    'apple-music:song:bad/id',
  ]) {
    assert.equal((await service.playTrack('native', uri)).success, false);
  }
  assert.equal(calls, 0);
});

test('an urgent Apple pause retires an unfinished load without pausing a newer command', async () => {
  const wait = deferred();
  let pauses = 0;
  const service = createAppleMusicService({
    supported: true,
    playTrack: () => wait.promise,
    pause: async () => {
      pauses++;
      return { success: true };
    },
  });
  const loading = service.playTrack('native', 'apple-music:song:123');
  await service.pause();
  wait.resolve({ success: true });
  assert.equal((await loading).cancelled, true);
  assert.equal(pauses, 1);
});

test('a cancelled phase pauses a completed native load and never reports playback success', async () => {
  const wait = deferred();
  let cancelled = false,
    pauses = 0;
  const service = createAppleMusicService({
    supported: true,
    playTrack: () => wait.promise,
    pause: async () => {
      pauses++;
      return { success: true };
    },
  });
  const loading = service.playTrack('native', 'apple-music:song:123', null, {
    isCancelled: () => cancelled,
  });
  cancelled = true;
  wait.resolve({ success: true });
  assert.equal((await loading).cancelled, true);
  assert.equal(pauses, 1);
});

test('Apple Music source resolution preserves per-round platform even with another source selected', () => {
  const routine = {
    roundsData: [
      {
        workSong: { uri: 'apple-music:song:123' },
        restPlaylistId: 'p.abc',
        restPlaylistPlatform: 'appleMusic',
      },
    ],
  };
  assert.equal(resolveRoundAudio(routine, 'work', 1, 'spotify').platform, 'appleMusic');
  assert.equal(resolveRoundAudio(routine, 'rest', 1, 'device').platform, 'appleMusic');
});

test('native connections survive storage reload without fabricated OAuth credentials', async () => {
  const records = new Map(),
    secure = new Map();
  const body = readFileSync(new URL('../src/lib/platformStorage.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export /gm, '');
  const storage = {
    getJSON: async (key, fallback) => records.get(key) ?? fallback,
    setJSON: async (key, value) => {
      records.set(key, value);
      return true;
    },
  };
  const scope = {
    Platform: { OS: 'ios' },
    storage,
    STORAGE_KEYS: { CONNECTED_PLATFORMS: 'connections' },
    SecureStore: {
      getItemAsync: async (key) => secure.get(key),
      setItemAsync: async (key, value) => secure.set(key, value),
    },
  };
  new Script(
    `${body}\nglobalThis.save = savePlatforms; globalThis.load = loadPlatforms;`,
  ).runInNewContext(scope);
  await scope.save({
    appleMusic: { connected: true, authentication: 'native' },
    spotify: { connected: true },
  });
  const connections = await scope.load();
  assert.equal(connections.appleMusic.connected, true);
  assert.equal(connections.appleMusic.accessToken, undefined);
  assert.equal(connections.spotify.connected, false);
  assert.equal(secure.get('syncapp.music.credentials'), '{"spotify":{}}');
});

test('native Apple connections load playlists and tracks through the shared music hook', async (t) => {
  let hook;
  const calls = [];
  function Harness() {
    hook = useMusicSearch({
      connectedPlatforms: { appleMusic: { connected: true, authentication: 'native' } },
      getValidAccessToken: async (id) => {
        calls.push(id);
        return 'native:appleMusic';
      },
      services: {
        appleMusic: {
          getUserPlaylists: async () => [{ id: 'p.abc', name: 'Library' }],
          getPlaylistTracks: async () => [{ id: '123', uri: 'apple-music:song:123' }],
          search: async () => ({ tracks: [{ id: '456', uri: 'apple-music:song:456' }] }),
        },
      },
    });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => act(async () => root.unmount()));
  await act(async () => {
    await hook.loadPlaylists('appleMusic');
  });
  assert.equal(hook.playlists[0].platform, 'appleMusic');
  await act(async () => {
    await hook.loadPlaylistTracks('p.abc', 'appleMusic');
  });
  assert.equal(hook.playlistTracks[0].platform, 'appleMusic');
  await act(async () => {
    await hook.searchMusic('workout', 'appleMusic');
  });
  assert.equal(hook.searchResults[0].id, '456');
  assert.deepEqual(calls, ['appleMusic', 'appleMusic', 'appleMusic']);
});

test('unknown and native providers cannot accidentally enter the OAuth refresh path', async () => {
  const store = createMusicConnections({
    initial: {
      appleMusic: { connected: true, authentication: 'native' },
      unknown: { connected: true, refreshToken: 'old' },
    },
    save: async () => {},
    onChange: () => {},
    services: {},
  });
  assert.equal(await store.refresh('appleMusic'), null);
  assert.equal(await store.refresh('unknown'), null);
});
