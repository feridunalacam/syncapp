import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(
  new URL('../src/context/AppleMusicConnectionContext.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const compiled = transformSync(
  `${source}\nglobalThis.result = { AppleMusicConnectionProvider, useAppleMusicConnection };`,
  {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  },
).code;
const ok = { success: true };
const song = {
  id: 'synthetic',
  uri: 'apple-music:song:synthetic',
  name: 'Synthetic song',
  duration: 60,
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((done) => setImmediate(done));
function world({ connected = true } = {}) {
  const events = [];
  const counts = { ads: 0, cues: 0, auth: 0, play: 0, stop: 0, save: 0, disconnect: 0, library: 0 };
  const controls = {
    stopFails: false,
    stopPromise: null,
    presenter: Promise.resolve(),
    library: async () => [],
    authorize: async () => ({ authentication: 'native' }),
  };
  let render = () => {};
  let playing = false;
  const marker = { connected, authentication: 'native' };
  const platform = {
    ready: true,
    appleMusicConnection: marker,
    connectedPlatforms: {},
    connectPlatform: async (id, data) => {
      counts.save++;
      assert.equal(id, 'appleMusic');
      assert.equal(data.authentication, 'native');
      marker.connected = true;
      render();
    },
    disconnectPlatform: async () => {
      counts.disconnect++;
      marker.connected = false;
      render();
    },
  };
  const service = {
    available: true,
    authorize: async () => {
      counts.auth++;
      events.push('authorize');
      return controls.authorize();
    },
    getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
    playTrack: async () => {
      counts.play++;
      playing = true;
      events.push('play');
      return ok;
    },
    playPlaylist: async () => {
      counts.play++;
      playing = true;
      return ok;
    },
    play: async () => {
      playing = true;
      return ok;
    },
    pause: async () => {
      playing = false;
      return ok;
    },
    cleanup: async () => {
      counts.stop++;
      if (controls.stopPromise) await controls.stopPromise;
      if (controls.stopFails) return false;
      playing = false;
    },
    setRepeat: async () => ok,
    setShuffle: async () => ok,
    next: async () => ok,
    previous: async () => ok,
    getCurrentPlayback: async () => ({ item: song, is_playing: playing, progress_ms: 5000 }),
    getUserPlaylists: async () => {
      counts.library++;
      return controls.library();
    },
    search: async () => ({ tracks: [song], playlists: [] }),
    getPlaylistTracks: async () => [song],
  };
  const lease = (kind) => {
    counts[kind]++;
    events.push(`${kind}:hold`);
    let released = false;
    return () => {
      assert.equal(released, false);
      released = true;
      counts[kind]--;
      events.push(`${kind}:release`);
    };
  };
  const ads = {
    acquirePresentationBlocker: () => lease('ads'),
    waitForAdPresenters: () => {
      events.push('presenters');
      return controls.presenter;
    },
  };
  const scope = {
    ...React,
    React,
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    usePlatformContext: () => platform,
    useAds: () => ads,
    appleMusicService: { available: false },
    appleMusicCompanionService: service,
    createAppleMusicCompanionController,
    acquireMusicCueSilence: () => lease('cues'),
  };
  new Script(compiled).runInNewContext(scope);
  return {
    ...scope.result,
    counts,
    events,
    controls,
    marker,
    service,
    setRender: (callback) => {
      render = callback;
    },
  };
}
async function mount(t, fixture, { readLibrary = false } = {}) {
  let value;
  let root;
  let mounted = true;
  function Observer() {
    value = fixture.useAppleMusicConnection();
    React.useEffect(() => {
      if (readLibrary && value.player.visible) void value.getPlaylists().catch(() => {});
    }, [value.getPlaylists, value.player.visible]);
    return null;
  }
  const element = () =>
    React.createElement(fixture.AppleMusicConnectionProvider, null, React.createElement(Observer));
  await act(async () => {
    root = create(element());
  });
  fixture.setRender(() => root.update(element()));
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
  };
  t.after(unmount);
  return {
    get value() {
      return value;
    },
    unmount,
  };
}

test('guest connection is explicitly initiated after presenter drain; opening alone never prompts or starts music', async (t) => {
  const fixture = world({ connected: false });
  const presenter = deferred();
  fixture.controls.presenter = presenter.promise;
  const ui = await mount(t, fixture);
  await act(async () => ui.value.player.open());
  assert.equal(fixture.counts.auth, 0);
  assert.equal(fixture.counts.play, 0);
  let connection;
  await act(async () => {
    connection = ui.value.connect();
    await flush();
  });
  assert.equal(fixture.counts.auth, 0);
  assert.ok(fixture.counts.ads > 0);
  presenter.resolve();
  await act(async () => {
    await connection;
  });
  assert.equal(fixture.counts.auth, 1);
  assert.equal(fixture.counts.save, 1);
  assert.equal(ui.value.connected, true);
  assert.equal(ui.value.timedAvailable, false);
  assert.equal(fixture.counts.play, 0);
  assert.equal(fixture.counts.cues, 0);
  await act(async () => ui.value.player.close());
  assert.equal(fixture.counts.ads, 0);
  assert.ok(fixture.events.indexOf('ads:hold') < fixture.events.indexOf('authorize'));
});

test('real provider playback updates keep catalog callback identities and pending library reads stable', async (t) => {
  const fixture = world();
  const library = deferred();
  fixture.controls.library = () => library.promise;
  const ui = await mount(t, fixture, { readLibrary: true });
  await act(async () => ui.value.player.open());
  const callbacks = [ui.value.search, ui.value.getPlaylists, ui.value.getPlaylistTracks];
  assert.equal(fixture.counts.library, 1);
  await act(async () => {
    await ui.value.player.playTrack(song);
  });
  await act(async () => {
    await ui.value.player.pause();
  });
  assert.deepEqual([ui.value.search, ui.value.getPlaylists, ui.value.getPlaylistTracks], callbacks);
  assert.equal(
    fixture.counts.library,
    1,
    'metadata/loading/paused state never restarts the unresolved read',
  );
  library.resolve([]);
  await act(async () => {
    await flush();
  });
  await act(async () => {
    await ui.value.player.clear();
    ui.value.player.close();
  });
  assert.equal(fixture.counts.ads, 0);
  assert.equal(fixture.counts.cues, 0);
});

test('failed old-account stop and recovery observer unmount do not leak cue silence after acknowledged recovery', async (t) => {
  const fixture = world();
  fixture.controls.stopFails = true;
  const old = await mount(t, fixture);
  await act(async () => {
    await old.value.player.playTrack(song);
  });
  await old.unmount();
  assert.equal(fixture.counts.cues, 1);
  const observer = await mount(t, fixture);
  await act(async () => observer.value.player.open());
  assert.equal(observer.value.player.previousOwnerPending, true);
  await observer.unmount();
  assert.equal(fixture.counts.cues, 1, 'an unowned retired observer releases its silence lease');
  assert.equal(fixture.counts.ads, 1, 'only the actual failed owner keeps its presentation lease');
  fixture.controls.stopFails = false;
  const current = await mount(t, fixture);
  assert.equal(current.value.player.isActive(), true);
  await act(async () => {
    await current.value.player.clear();
  });
  assert.equal(current.value.player.isActive(), false);
  assert.equal(fixture.counts.cues, 0);
  assert.equal(fixture.counts.ads, 0);
});

test('paused queue retains ad and cue ownership through disconnect until native stop acknowledgement', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  await act(async () => {
    await ui.value.player.playTrack(song);
    await ui.value.player.pause();
  });
  assert.equal(fixture.counts.ads, 1);
  assert.equal(fixture.counts.cues, 1);
  const stop = deferred();
  fixture.controls.stopPromise = stop.promise;
  let disconnected;
  await act(async () => {
    disconnected = ui.value.disconnect();
    await flush();
  });
  assert.equal(fixture.counts.disconnect, 0);
  assert.equal(ui.value.player.isActive(), true);
  assert.equal(fixture.counts.ads, 1);
  assert.equal(fixture.counts.cues, 1);
  stop.resolve();
  await act(async () => {
    await disconnected;
  });
  assert.equal(fixture.counts.disconnect, 1);
  assert.equal(ui.value.connected, false);
  assert.equal(fixture.counts.ads, 0);
  assert.equal(fixture.counts.cues, 0);
});

test('catalog errors remain scoped to their readers and cannot create stale global connection alerts', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  fixture.controls.library = async () => {
    throw new Error('Temporary library failure');
  };
  await act(async () => {
    await assert.rejects(ui.value.getPlaylists(), /Temporary/);
  });
  assert.equal(ui.value.error, null);
  fixture.controls.library = async () => [];
  await act(async () => {
    await ui.value.getPlaylists();
  });
  assert.equal(ui.value.error, null);
  const old = deferred();
  fixture.controls.library = () => old.promise;
  let pending;
  await act(async () => {
    pending = ui.value.getPlaylists();
  });
  await act(async () => {
    await ui.value.search('new');
  });
  old.reject(new Error('Retired catalog failure'));
  await act(async () => {
    await assert.rejects(pending, /Retired/);
  });
  assert.equal(ui.value.error, null);
  assert.equal(fixture.counts.ads, 0);
});

test('permission failures save no connection and catalog results cannot escape after disconnect', async (t) => {
  const fixture = world({ connected: false });
  fixture.controls.authorize = async () => {
    throw new Error('Music permission denied');
  };
  const ui = await mount(t, fixture);
  await act(async () => {
    assert.equal((await ui.value.connect()).success, false);
  });
  assert.equal(fixture.counts.save, 0);
  assert.equal(fixture.counts.ads, 0);
  assert.equal(fixture.counts.cues, 0);
  fixture.controls.authorize = async () => ({ authentication: 'native' });
  await act(async () => {
    await ui.value.connect();
  });
  const library = deferred();
  fixture.controls.library = () => library.promise;
  let pending;
  await act(async () => {
    pending = ui.value.getPlaylists();
  });
  await act(async () => {
    await ui.value.disconnect();
  });
  library.resolve([{ id: 'retired' }]);
  await act(async () => {
    await assert.rejects(pending, /cancelled/);
  });
  assert.equal(fixture.counts.ads, 0);
});

test('catalog success leaves a separate connection failure visible', async (t) => {
  const fixture = world();
  fixture.controls.authorize = async () => {
    throw new Error('Connection permission failure');
  };
  const ui = await mount(t, fixture);
  await act(async () => {
    await ui.value.connect();
  });
  assert.match(ui.value.error, /Connection permission failure/);
  await act(async () => {
    await ui.value.getPlaylists();
  });
  assert.match(ui.value.error, /Connection permission failure/);
});
