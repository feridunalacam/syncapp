import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';
import { createCueHandoff } from '../src/services/alerts/cueHandoff.js';
import {
  normalizeRoutineSoundtrack,
  soundtrackPlaybackItem,
} from '../src/domain/routineSoundtrack.js';

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
  const nativeStarts = [];
  const timers = new Map();
  let timerSequence = 0;
  const cueHandoff = createCueHandoff({ stopOutput: async () => {} });
  const counts = {
    ads: 0,
    cues: 0,
    auth: 0,
    play: 0,
    stop: 0,
    save: 0,
    disconnect: 0,
    library: 0,
    artwork: 0,
  };
  const controls = {
    stopFails: false,
    stopPromise: null,
    presenter: Promise.resolve(),
    library: async () => [],
    artwork: async () => [],
    token: async () => ({ accessToken: 'native:appleMusic' }),
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
    getAccessToken: () => controls.token(),
    playTrack: async (...args) => {
      nativeStarts.push({ kind: 'track', args });
      counts.play++;
      playing = true;
      events.push('play');
      return ok;
    },
    playPlaylist: async (...args) => {
      nativeStarts.push({ kind: 'playlist', args });
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
    getPlaylistArtwork: async (_token, ids) => {
      counts.artwork++;
      return controls.artwork(ids);
    },
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
    setTimeout: (callback, milliseconds) => {
      const id = ++timerSequence;
      timers.set(id, { callback, milliseconds });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    usePlatformContext: () => platform,
    useAds: () => ads,
    appleMusicService: { available: false },
    appleMusicCompanionService: service,
    createAppleMusicCompanionController,
    normalizeRoutineSoundtrack,
    soundtrackPlaybackItem,
    acquireMusicCueSilence: () => lease('cues'),
    registerCueMusicSource: (source) => cueHandoff.register(source),
  };
  new Script(compiled).runInNewContext(scope);
  return {
    ...scope.result,
    counts,
    events,
    nativeStarts,
    controls,
    marker,
    service,
    cueHandoff,
    timers,
    expireArtworkDeadline: () => {
      for (const [id, timer] of timers) {
        assert.equal(timer.milliseconds, 12000);
        timers.delete(id);
        timer.callback();
      }
    },
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
  const callbacks = [
    ui.value.search,
    ui.value.getPlaylists,
    ui.value.getPlaylistTracks,
    ui.value.getPlaylistArtwork,
  ];
  assert.equal(fixture.counts.library, 1);
  await act(async () => {
    await ui.value.player.playTrack(song);
  });
  await act(async () => {
    await ui.value.player.pause();
  });
  assert.deepEqual(
    [
      ui.value.search,
      ui.value.getPlaylists,
      ui.value.getPlaylistTracks,
      ui.value.getPlaylistArtwork,
    ],
    callbacks,
  );
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

test('optional artwork holds only its catalog lease and returns failures without a connection alert', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const reply = deferred();
  fixture.controls.artwork = (ids) => {
    assert.deepEqual(ids, ['p.one']);
    return reply.promise;
  };
  let pending;
  await act(async () => {
    pending = ui.value.getPlaylistArtwork(['p.one']);
    await flush();
  });
  assert.equal(fixture.counts.artwork, 1);
  assert.equal(fixture.counts.ads, 1);
  assert.equal(fixture.counts.cues, 0);
  assert.equal(fixture.counts.play, 0);
  reply.reject(new Error('Optional artwork offline'));
  await act(async () => assert.deepEqual(Array.from(await pending), []));
  assert.equal(fixture.counts.ads, 0);
  assert.equal(ui.value.error, null);
  delete fixture.service.getPlaylistArtwork;
  await act(async () =>
    assert.deepEqual(Array.from(await ui.value.getPlaylistArtwork(['p.one'])), []),
  );
  assert.equal(fixture.counts.ads, 0);
});

test('disconnect and reconnect cannot publish artwork from the previous connection', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const reply = deferred();
  fixture.controls.artwork = () => reply.promise;
  let pending;
  await act(async () => {
    pending = ui.value.getPlaylistArtwork(['p.one']);
    await flush();
  });
  await act(async () => {
    await ui.value.disconnect();
    await ui.value.connect();
  });
  assert.equal(ui.value.connected, true);
  reply.resolve([{ id: 'p.one', image: 'https://example.test/retired.jpg' }]);
  await act(async () => assert.deepEqual(Array.from(await pending), []));
  assert.equal(fixture.counts.ads, 0);
  assert.equal(ui.value.error, null);
  fixture.controls.artwork = async () => [
    { id: 'p.one', image: 'https://example.test/current.jpg' },
  ];
  await act(async () =>
    assert.equal(
      (await ui.value.getPlaylistArtwork(['p.one']))[0].image,
      'https://example.test/current.jpg',
    ),
  );
});

test('an artwork read retired by provider unmount releases its lease and never returns stale rows', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const reply = deferred();
  fixture.controls.artwork = () => reply.promise;
  let pending;
  await act(async () => {
    pending = ui.value.getPlaylistArtwork(['p.one']);
    await flush();
  });
  assert.equal(fixture.counts.ads, 1);
  await ui.unmount();
  reply.resolve([{ id: 'p.one', image: 'https://example.test/retired.jpg' }]);
  assert.deepEqual(Array.from(await pending), []);
  assert.equal(fixture.counts.ads, 0);
});

test('optional artwork has one total deadline across presenter, token and native waits', async (t) => {
  for (const stage of ['presenter', 'token', 'native']) {
    const fixture = world();
    const ui = await mount(t, fixture);
    const wait = deferred();
    if (stage === 'presenter') fixture.controls.presenter = wait.promise;
    if (stage === 'token') fixture.controls.token = () => wait.promise;
    if (stage === 'native') fixture.controls.artwork = () => wait.promise;
    let pending;
    await act(async () => {
      pending = ui.value.getPlaylistArtwork(['p.one']);
      await flush();
    });
    assert.equal(fixture.counts.ads, 1);
    assert.equal(fixture.timers.size, 1);
    await act(async () => {
      fixture.expireArtworkDeadline();
      assert.deepEqual(Array.from(await pending), []);
    });
    assert.equal(fixture.counts.ads, 0, `${stage}: caller returns before underlying wait settles`);
    assert.equal(fixture.timers.size, 0);
    assert.equal(ui.value.error, null);
    wait.resolve(
      stage === 'token'
        ? { accessToken: 'native:appleMusic' }
        : [{ id: 'p.one', image: 'https://example.test/late.jpg' }],
    );
    await act(async () => flush());
    assert.equal(
      fixture.counts.artwork,
      stage === 'native' ? 1 : 0,
      'late preflight never dispatches a native artwork read',
    );
    assert.equal(fixture.counts.ads, 0, 'late settlement cannot reacquire the released lease');
    await ui.unmount();
  }
});

test('successful optional artwork clears its deadline without affecting playback leases', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  await act(async () => ui.value.player.playTrack(song));
  assert.equal(fixture.counts.ads, 1);
  fixture.controls.artwork = async () => [
    { id: 'p.one', image: 'https://example.test/current.jpg' },
  ];
  await act(async () =>
    assert.equal((await ui.value.getPlaylistArtwork(['p.one']))[0].id, 'p.one'),
  );
  assert.equal(fixture.timers.size, 0);
  assert.equal(
    fixture.counts.ads,
    1,
    'artwork releases only its own lease; music still owns its queue',
  );
  assert.equal(fixture.counts.cues, 1);
  await act(async () => ui.value.player.clear());
  assert.equal(fixture.counts.ads, 0);
});

const soundtrack = {
  platform: 'appleMusic',
  kind: 'playlist',
  id: 'p.saved',
  name: 'Saved list',
  shuffle: true,
};

test('routine selector chooses once without starting music or changing a global queue', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const selected = [];
  const shuffleValues = [];
  await act(async () =>
    ui.value.openSoundtrackPicker({
      routineName: 'Boxing',
      selection: soundtrack,
      onSelect: (item, shuffle) => {
        selected.push(item);
        shuffleValues.push(shuffle);
      },
    }),
  );
  const request = ui.value.soundtrackPicker;
  assert.equal(request.initialTab, 'library');
  assert.equal(request.routineName, 'Boxing');
  assert.equal(request.selection.id, 'p.saved');
  assert.equal(request.selection.shuffle, true);
  assert.equal(ui.value.player.visible, true);
  assert.equal(fixture.counts.play, 0);
  await act(async () => {
    assert.equal(ui.value.selectSoundtrackItem(request.id, soundtrack, true).success, true);
    assert.equal(ui.value.selectSoundtrackItem(request.id, soundtrack, true).success, false);
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].shuffle, true);
  assert.deepEqual(
    shuffleValues,
    [true],
    'the editor callback receives the saved shuffle preference explicitly',
  );
  assert.equal(ui.value.soundtrackPicker, null);
  assert.equal(ui.value.player.visible, false);
  assert.equal(fixture.counts.play, 0);
  assert.equal(fixture.counts.ads, 0);
});

test('selector cancellation is request-scoped and old callbacks cannot select into a newer routine', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const selected = [];
  let cancelOld, cancelNew, oldID, newID;
  await act(async () => {
    cancelOld = ui.value.openSoundtrackPicker({
      routineName: 'A',
      onSelect: () => selected.push('old'),
    });
  });
  oldID = ui.value.soundtrackPicker.id;
  await act(async () => {
    cancelNew = ui.value.openSoundtrackPicker({
      routineName: 'B',
      onSelect: () => selected.push('new'),
    });
  });
  newID = ui.value.soundtrackPicker.id;
  await act(async () => cancelOld());
  assert.equal(ui.value.soundtrackPicker.id, newID);
  assert.equal(ui.value.player.visible, true);
  await act(async () =>
    assert.equal(ui.value.selectSoundtrackItem(oldID, soundtrack, true).success, false),
  );
  assert.equal(ui.value.soundtrackPicker.id, newID);
  await act(async () => cancelNew());
  assert.equal(ui.value.soundtrackPicker, null);
  await act(async () =>
    assert.equal(ui.value.selectSoundtrackItem(newID, soundtrack, true).success, false),
  );
  assert.deepEqual(selected, []);
  assert.equal(fixture.counts.play, 0);
});

test('opening normal player, disconnect and unmount retire pending routine selectors', async (t) => {
  for (const boundary of ['normal-player', 'disconnect', 'unmount']) {
    const fixture = world();
    const ui = await mount(t, fixture);
    let selections = 0;
    await act(async () => ui.value.openSoundtrackPicker({ onSelect: () => selections++ }));
    const id = ui.value.soundtrackPicker.id;
    if (boundary === 'normal-player') await act(async () => ui.value.player.open());
    if (boundary === 'disconnect') await act(async () => ui.value.disconnect());
    if (boundary === 'unmount') await ui.unmount();
    await act(async () =>
      assert.equal(ui.value.selectSoundtrackItem(id, soundtrack, true).success, false),
    );
    assert.equal(selections, 0);
    assert.equal(fixture.counts.play, 0);
    if (boundary === 'normal-player') assert.equal(ui.value.player.visible, true);
  }
});

test('explicit routine Play uses saved identity and shuffle only after previous audio stop acknowledgement', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  const stop = deferred();
  ui.value.player.registerBeforePlay(() => stop.promise);
  let pending;
  await act(async () => {
    pending = ui.value.player.playSoundtrack(soundtrack);
    await flush();
  });
  assert.equal(
    ui.value.player.isActive(),
    true,
    'reservation blocks phase audio before transport starts',
  );
  assert.equal(fixture.counts.play, 0);
  stop.resolve(ok);
  await act(async () => pending);
  assert.equal(fixture.nativeStarts.length, 1);
  assert.equal(fixture.nativeStarts[0].kind, 'playlist');
  assert.equal(fixture.nativeStarts[0].args[1], 'p.saved');
  assert.equal(fixture.nativeStarts[0].args[3], true);
  await act(async () => ui.value.player.clear());
  assert.equal(fixture.counts.ads, 0);
});

test('invalid routine music and failed local-audio stop never start companion transport', async (t) => {
  const fixture = world();
  const ui = await mount(t, fixture);
  await act(async () =>
    assert.equal(
      (await ui.value.player.playSoundtrack({ ...soundtrack, id: 'file:///bad' })).success,
      false,
    ),
  );
  ui.value.player.registerBeforePlay(async () => ({ success: false, error: 'Local stop failed' }));
  await act(async () =>
    assert.equal((await ui.value.player.playSoundtrack(soundtrack)).success, false),
  );
  assert.equal(fixture.counts.play, 0);
  assert.equal(fixture.nativeStarts.length, 0);
});
