import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';

const ok = { success: true };
const song = (id) => ({
  id,
  uri: `apple-music:song:${id}`,
  name: `Song ${id}`,
  duration: 60,
  image: `https://example.test/${id}.jpg`,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise((done) => setImmediate(done));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
function harness(t, overrides = {}, options = {}) {
  const calls = [];
  let held = 0;
  let releases = 0;
  let current = null;
  let playing = false;
  const service = {
    authorize: async () => {
      calls.push('authorize');
      return { authentication: 'native' };
    },
    getAccessToken: async () => {
      calls.push('access');
      return { accessToken: 'native:appleMusic' };
    },
    playTrack: async (_token, uri) => {
      calls.push(['track', uri]);
      current = song(uri.split(':').at(-1));
      playing = true;
      return ok;
    },
    playPlaylist: async (_token, id, _device, shuffle) => {
      calls.push(['playlist', id, shuffle]);
      current = song('playlist-first');
      playing = true;
      return ok;
    },
    play: async () => {
      calls.push('resume');
      playing = true;
      return ok;
    },
    pause: async () => {
      calls.push('pause');
      playing = false;
      return ok;
    },
    cleanup: async () => {
      calls.push('stop');
      current = null;
      playing = false;
    },
    getCurrentPlayback: async () => {
      calls.push('read');
      return { item: current, is_playing: playing, progress_ms: 1500 };
    },
    next: async () => {
      calls.push('next');
      return ok;
    },
    previous: async () => {
      calls.push('previous');
      return ok;
    },
    setShuffle: async (_token, enabled) => {
      calls.push(['shuffle', enabled]);
      return ok;
    },
    setRepeat: async (_token, mode) => {
      calls.push(['repeat', mode]);
      return ok;
    },
    ...overrides,
  };
  const states = [];
  const controller = createAppleMusicCompanionController({
    service,
    pollIntervalMs: 10000,
    acquireBlocker: () => {
      held++;
      let released = false;
      return () => {
        assert.equal(released, false);
        released = true;
        held--;
        releases++;
      };
    },
    onChange: (state) => states.push(state),
    ...options,
  });
  t.after(() => controller.dispose());
  return {
    controller,
    service,
    calls,
    states,
    get held() {
      return held;
    },
    get releases() {
      return releases;
    },
  };
}

test('same-track sparse polling retains artwork while refreshing playback metadata and progress', async (t) => {
  const selected = song('artwork');
  const h = harness(t, {
    getCurrentPlayback: async () => ({
      item: {
        id: selected.id,
        uri: selected.uri,
        name: 'Updated title',
        artist: 'Updated artist',
        duration_ms: 120000,
        image: '',
        coverUrl: ' ',
      },
      is_playing: false,
      progress_ms: 30000,
    }),
  });
  await h.controller.playTrack(selected);
  await h.controller.refresh();
  const state = h.controller.getState();
  assert.equal(state.track.coverUrl, selected.image);
  assert.equal(state.track.title, 'Updated title');
  assert.equal(state.track.artist, 'Updated artist');
  assert.equal(state.track.duration, 120);
  assert.equal(state.progress, 25);
  assert.equal(state.playing, false);
});

test('fresh playback artwork replaces retained same-track artwork', async (t) => {
  const selected = song('new-cover');
  let image = '';
  const h = harness(t, {
    getCurrentPlayback: async () => ({ item: { ...selected, image }, is_playing: true }),
  });
  await h.controller.playTrack(selected);
  await h.controller.refresh();
  assert.equal(h.controller.getState().track.coverUrl, selected.image);
  image = 'https://example.test/updated-cover.jpg';
  await h.controller.refresh();
  assert.equal(h.controller.getState().track.coverUrl, image);
});

test('sparse playback never carries artwork to a different, unidentified or conflicting track', async (t) => {
  const selected = song('original');
  for (const item of [
    { ...song('next'), image: '' },
    { name: selected.name, image: '' },
    { id: selected.id, uri: 'apple-music:song:next', image: '' },
    { id: selected.id, type: 'playlist', image: '' },
    { id: selected.id, platform: 'spotify', image: '' },
    { id: selected.id, uri: 'https://example.test/another-song', image: '' },
  ]) {
    const h = harness(t, {
      getCurrentPlayback: async () => ({ item, is_playing: true }),
    });
    await h.controller.playTrack(selected);
    await h.controller.refresh();
    assert.equal(h.controller.getState().track.coverUrl, null);
  }
});

test('a sparse URI-only playback item retains artwork for the same Apple Music song', async (t) => {
  const selected = song('uri-only');
  const h = harness(t, {
    getCurrentPlayback: async () => ({ item: { uri: selected.uri, image: '' }, is_playing: true }),
  });
  await h.controller.playTrack(selected);
  await h.controller.refresh();
  assert.equal(h.controller.getState().track.coverUrl, selected.image);
});

test('opening the companion and foregrounding never initiates music or reads an unrelated player', async (t) => {
  const h = harness(t);
  h.controller.setVisible(true);
  assert.equal(h.held, 1);
  h.controller.setAppActive(false);
  h.controller.setAppActive(true);
  await h.controller.refresh();
  await h.controller.pause();
  await h.controller.resume();
  await h.controller.clear();
  assert.deepEqual(h.calls, []);
  h.controller.setVisible(false);
  assert.equal(h.held, 0);
});

test('authorization waits for ad presenters and retains its blocker through a permission failure', async (t) => {
  const presenter = deferred();
  const permission = deferred();
  const h = harness(
    t,
    {
      authorize: () => {
        h.calls.push('authorize');
        return permission.promise;
      },
    },
    { waitForPresenters: () => presenter.promise },
  );
  h.controller.setVisible(true);
  const pending = h.controller.runPermission();
  h.controller.setVisible(false);
  assert.equal(h.held, 1);
  assert.deepEqual(h.calls, []);
  presenter.resolve();
  await flush();
  assert.deepEqual(h.calls, ['authorize']);
  permission.reject(new Error('Music access denied'));
  assert.equal((await pending).success, false);
  assert.match(h.controller.getState().error, /denied/);
  assert.equal(h.held, 0);
  assert.equal(h.calls.includes('stop'), false);
});

test('explicit playlist play drains presenters and prior sources; paused queues retain ad ownership until acknowledged clear', async (t) => {
  const stopped = deferred();
  const h = harness(
    t,
    {
      cleanup: () => {
        h.calls.push('stop');
        return stopped.promise;
      },
    },
    {
      waitForPresenters: async () => h.calls.push('presenters'),
      beforePlay: async () => h.calls.push('before'),
    },
  );
  const pending = h.controller.playPlaylist({ id: 'p.playlist', name: 'Playlist' }, true);
  assert.equal(h.controller.isActive(), true, 'reservation is synchronous');
  assert.equal(h.held, 1);
  assert.equal((await pending).success, true);
  await flush();
  assert.deepEqual(h.calls.slice(0, 5), [
    'presenters',
    'before',
    'access',
    ['playlist', 'p.playlist', true],
    ['repeat', 'off'],
  ]);
  assert.equal(h.controller.getState().track.title, 'Song playlist-first');
  assert.equal(h.controller.getState().progress, 2.5);
  await h.controller.pause();
  h.controller.setVisible(false);
  assert.equal(h.controller.getState().playing, false);
  assert.equal(h.controller.isActive(), true);
  assert.equal(h.held, 1);
  const cleared = h.controller.clear();
  assert.equal(h.controller.getState().ownsQueue, true);
  assert.equal(h.held, 1);
  stopped.resolve();
  await cleared;
  assert.equal(h.controller.isActive(), false);
  assert.equal(h.held, 0);
});

test('a slow old play cannot replace or stop the newest explicit choice', async (t) => {
  const first = deferred();
  const h = harness(t, {
    playTrack: async (_token, uri) => {
      h.calls.push(['track', uri]);
      return uri.endsWith(':old') ? first.promise : ok;
    },
  });
  const old = h.controller.playTrack(song('old'));
  await flush();
  await h.controller.playTrack(song('new'));
  first.resolve(ok);
  assert.equal((await old).cancelled, true);
  assert.equal(h.controller.getState().track.title, 'Song new');
  assert.equal(
    h.controller.getState().playing,
    false,
    'metadata reflects the synthetic player state',
  );
  assert.equal(h.calls.includes('stop'), false);
});

test('clear retires an in-flight native play and holds its reservation until that play settles', async (t) => {
  const native = deferred();
  const h = harness(t, { playTrack: () => native.promise });
  const pending = h.controller.playTrack(song('pending'));
  await flush();
  await h.controller.clear();
  assert.equal(h.calls.filter((call) => call === 'stop').length, 1);
  assert.equal(h.controller.getState().ownsQueue, false);
  assert.equal(h.controller.isActive(), true);
  assert.equal(h.held, 1);
  native.resolve(ok);
  assert.equal((await pending).cancelled, true);
  assert.equal(h.controller.isActive(), false);
  assert.equal(h.controller.getState().track, null);
  assert.equal(h.held, 0);
});

test('dispose during preflight never starts music or stops a player it has not acquired', async (t) => {
  const prior = deferred();
  const h = harness(t, {}, { beforePlay: () => prior.promise });
  const pending = h.controller.playTrack(song('obsolete'));
  await flush();
  await h.controller.dispose();
  assert.equal(h.held, 1, 'loading reservation remains blocked until retired work settles');
  prior.resolve();
  assert.equal((await pending).cancelled, true);
  assert.deepEqual(h.calls, []);
  assert.equal(h.held, 0);
  assert.equal((await h.controller.runPermission()).cancelled, true);
});

test('a superseded account controller cannot stop the newer controller queue', async (t) => {
  const old = harness(t);
  await old.controller.playTrack(song('old-account'));
  const newer = { controller: createAppleMusicCompanionController({ service: old.service }) };
  t.after(() => newer.controller.dispose());
  await newer.controller.playTrack(song('new-account'));
  assert.equal(old.controller.getState().ownsQueue, false);
  assert.equal(old.controller.isActive(), false);
  await old.controller.dispose();
  assert.equal(old.calls.includes('stop'), false);
  assert.equal(newer.controller.isActive(), true);
  await newer.controller.clear();
  assert.equal(old.calls.filter((call) => call === 'stop').length, 1);
});

test('failed controls retain the last acknowledged setting and show errors', async (t) => {
  let repeatFails = false;
  const h = harness(t, {
    setShuffle: async () => false,
    setRepeat: async () => (repeatFails ? { success: false, error: 'Repeat unavailable' } : ok),
    next: async () => {
      throw new Error('Next unavailable');
    },
  });
  await h.controller.playTrack(song('one'));
  assert.equal((await h.controller.setShuffle(true)).success, false);
  assert.equal(h.controller.getState().shuffle, false);
  repeatFails = true;
  assert.equal((await h.controller.setRepeat('track')).success, false);
  assert.equal(h.controller.getState().repeat, 'off');
  assert.match(h.controller.getState().error, /Repeat unavailable/);
  assert.equal((await h.controller.next()).success, false);
  assert.match(h.controller.getState().error, /Next unavailable/);
  assert.equal(h.controller.getState().ownsQueue, true);
  assert.equal(h.held, 1);
});

test('an older failed control cannot overwrite a newer acknowledged setting', async (t) => {
  const first = deferred();
  let changes = 0;
  const h = harness(t, {
    setShuffle: () => (++changes === 1 ? first.promise : Promise.resolve(ok)),
  });
  await h.controller.playTrack(song('one'));
  const old = h.controller.setShuffle(true);
  await h.controller.setShuffle(false);
  first.resolve(false);
  assert.equal((await old).cancelled, true);
  assert.equal(h.controller.getState().shuffle, false);
  assert.equal(h.controller.getState().error, null);
});

test('polling works without a timer, never overlaps, observes paused queues, and stops when the app is inactive', async (t) => {
  const sample = deferred();
  let reads = 0;
  const h = harness(
    t,
    {
      getCurrentPlayback: () => {
        reads++;
        return reads === 1
          ? sample.promise
          : Promise.resolve({ is_playing: false, item: song('observed'), progress_ms: 8000 });
      },
    },
    { pollIntervalMs: 5 },
  );
  await h.controller.playTrack(song('one'));
  await flush();
  const a = h.controller.refresh();
  const b = h.controller.refresh();
  assert.equal(a, b);
  await wait(20);
  assert.equal(reads, 1);
  sample.resolve({ is_playing: true, item: song('observed'), progress_ms: 5000 });
  await a;
  assert.equal(h.controller.getState().progress, (5 / 60) * 100);
  await h.controller.pause();
  await wait(15);
  assert.ok(reads >= 2, 'owned paused queues remain observable');
  h.controller.setAppActive(false);
  await flush();
  const inactiveReads = reads;
  await wait(15);
  assert.equal(reads, inactiveReads);
  h.controller.setAppActive(true);
  await flush();
  assert.ok(reads > inactiveReads);
  assert.equal(h.calls.includes('resume'), false);
  assert.equal(h.controller.getState().playing, false);
});

test('stale metadata cannot overwrite a newer selected song', async (t) => {
  const sample = deferred();
  let reads = 0;
  const h = harness(t, {
    getCurrentPlayback: () =>
      ++reads === 1 ? sample.promise : Promise.resolve({ item: song('new'), is_playing: true }),
  });
  await h.controller.playTrack(song('old'));
  await flush();
  await h.controller.playTrack(song('new'));
  sample.resolve({ item: song('old'), is_playing: true });
  await flush();
  assert.equal(h.controller.getState().track.title, 'Song new');
  await h.controller.refresh();
  assert.equal(h.controller.getState().track.coverUrl, 'https://example.test/new.jpg');
});

test('a rejected beforePlay does not touch the native player', async (t) => {
  const h = harness(
    t,
    {},
    {
      beforePlay: async () => {
        throw new Error('Prior audio could not stop');
      },
    },
  );
  assert.equal((await h.controller.playTrack(song('one'))).success, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.held, 0);
});

test('failed stop retains owned queue and blocker until a later stop succeeds', async (t) => {
  let fail = true;
  const h = harness(t, { cleanup: async () => (fail ? false : undefined) });
  await h.controller.playTrack(song('one'));
  assert.equal((await h.controller.clear()).success, false);
  assert.equal(h.controller.isActive(), true);
  assert.equal(h.held, 1);
  fail = false;
  await h.controller.clear();
  assert.equal(h.controller.isActive(), false);
  assert.equal(h.held, 0);
});

test('new explicit play waits for an acknowledged prior stop', async (t) => {
  const stop = deferred();
  const h = harness(t, { cleanup: () => stop.promise });
  await h.controller.playTrack(song('old'));
  const clearing = h.controller.clear();
  const newer = h.controller.playTrack(song('new'));
  await flush();
  assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'track').length, 1);
  stop.resolve();
  await clearing;
  await newer;
  assert.equal(h.calls.filter((call) => Array.isArray(call) && call[0] === 'track').length, 2);
  assert.equal(h.controller.getState().ownsQueue, true);
});

test('permission supersession cannot become success and keeps the prompt blocked until it settles', async (t) => {
  const permission = deferred();
  const h = harness(t, { authorize: () => permission.promise });
  const pending = h.controller.runPermission();
  await flush();
  await h.controller.clear();
  assert.equal(h.held, 1);
  permission.resolve({ authentication: 'native' });
  assert.equal((await pending).cancelled, true);
  assert.equal(h.held, 0);
  assert.equal(h.calls.includes('stop'), false);
});

test('a delayed earlier account request cannot replace the newer account queue', async (t) => {
  const access = deferred();
  const old = harness(t);
  await old.controller.playTrack(song('old'));
  let requests = 0;
  old.service.getAccessToken = () =>
    ++requests === 1 ? access.promise : Promise.resolve({ accessToken: 'native:appleMusic' });
  const waiting = createAppleMusicCompanionController({ service: old.service });
  const newest = createAppleMusicCompanionController({ service: old.service });
  t.after(() => waiting.dispose());
  t.after(() => newest.dispose());
  const pending = waiting.playTrack(song('waiting'));
  await flush();
  await newest.playTrack(song('newest'));
  assert.equal(old.controller.isActive(), false);
  access.resolve({ accessToken: 'native:appleMusic' });
  assert.equal((await pending).cancelled, true);
  assert.equal(newest.isActive(), true, 'the latest user choice owns the shared player');
  await waiting.dispose();
  assert.equal(old.calls.includes('stop'), false);
  assert.equal(waiting.isActive(), false);
});

test('a failed initial playback or repeat setup stops only the queue it actually acquired', async (t) => {
  const failedPlay = harness(t, {
    playTrack: async () => ({ success: false, error: 'Unavailable content' }),
  });
  assert.equal((await failedPlay.controller.playTrack(song('missing'))).success, false);
  assert.equal(failedPlay.calls.filter((call) => call === 'stop').length, 1);
  assert.equal(failedPlay.controller.isActive(), false);
  const failedRepeat = harness(t, { setRepeat: async () => false });
  assert.equal((await failedRepeat.controller.playPlaylist({ id: 'p.one' })).success, false);
  assert.equal(failedRepeat.calls.filter((call) => call === 'stop').length, 1);
  assert.equal(failedRepeat.held, 0);
});

test('progress uses native duration in milliseconds and clamps unknown or out-of-range samples to a percentage', async (t) => {
  let sample = { item: { id: 'native', name: 'Native', duration_ms: 200000 }, progress_ms: 50000 };
  const h = harness(t, { getCurrentPlayback: async () => sample });
  await h.controller.playTrack(song('selected'));
  await h.controller.refresh();
  assert.equal(h.controller.getState().progress, 25);
  sample = { item: { id: 'native', duration_ms: 200000 }, progress_ms: 250000 };
  await h.controller.refresh();
  assert.equal(h.controller.getState().progress, 100);
  sample = { item: { id: 'native', duration_ms: 200000 }, progress_ms: -1000 };
  await h.controller.refresh();
  assert.equal(h.controller.getState().progress, 0);
  sample = { item: { id: 'native' }, progress_ms: 2000 };
  await h.controller.refresh();
  assert.equal(h.controller.getState().progress, 0);
  sample = { item: { id: 'native', duration_ms: 200000 }, progress_ms: NaN };
  await h.controller.refresh();
  assert.equal(h.controller.getState().progress, 0);
});

test('account disposal waits for native stop while a new account waits to acquire the queue', async (t) => {
  const playing = deferred();
  const stopped = deferred();
  const old = harness(t, {
    playTrack: (_token, uri) => (uri.endsWith(':old') ? playing.promise : Promise.resolve(ok)),
    cleanup: () => {
      old.calls.push('stop');
      return stopped.promise;
    },
  });
  const oldStart = old.controller.playTrack(song('old'));
  await flush();
  const disposal = old.controller.dispose();
  const newer = createAppleMusicCompanionController({ service: old.service });
  t.after(() => newer.dispose());
  const newStart = newer.playTrack(song('new'));
  await flush();
  assert.equal(old.controller.getState().ownsQueue, true);
  assert.equal(old.held, 1);
  assert.equal(newer.getState().ownsQueue, false);
  assert.equal(newer.getState().reserved, true);
  stopped.resolve();
  await disposal;
  await newStart;
  playing.resolve(ok);
  assert.equal((await oldStart).cancelled, true);
  assert.equal(old.controller.isActive(), false);
  assert.equal(old.held, 0);
  assert.equal(newer.getState().ownsQueue, true);
  assert.equal(old.calls.filter((call) => call === 'stop').length, 1);
});

for (const failure of ['false', 'throw']) {
  test(`a retired owner with ${failure} stop failure blocks the next account until explicit acknowledged recovery`, async (t) => {
    const stop = deferred();
    let attempts = 0;
    const old = harness(t, {
      cleanup: () => {
        old.calls.push('stop');
        if (++attempts > 1) return stop.promise;
        if (failure === 'throw') throw new Error('Native stop failed');
        return false;
      },
    });
    await old.controller.playTrack(song('private-old-account'));
    assert.equal((await old.controller.dispose()).success, false);
    assert.equal(old.held, 1);
    const states = [];
    const newer = createAppleMusicCompanionController({
      service: old.service,
      onChange: (state) => states.push(state),
    });
    t.after(() => newer.dispose());
    assert.equal(newer.getState().previousOwnerPending, true);
    assert.equal(newer.getState().track, null, 'old account metadata is never exposed');
    assert.equal(newer.getState().ownsQueue, false);
    assert.equal(newer.isActive(), true);
    assert.equal((await newer.playTrack(song('blocked'))).success, false);
    assert.equal(newer.getState().ownsQueue, false);
    assert.equal(
      attempts,
      1,
      'new play cannot implicitly retry or replace an uncertain retired queue',
    );
    let deviceStarts = 0;
    const startTimerAudio = () => {
      if (!newer.isActive()) deviceStarts++;
    };
    startTimerAudio();
    assert.equal(
      deviceStarts,
      0,
      'parent synchronous bypass protects against uncertain old playback',
    );
    const recovery = newer.clear();
    await flush();
    assert.equal(attempts, 2, 'one explicit clear makes one bounded owned-stop retry');
    assert.equal(newer.isActive(), true);
    assert.equal(old.held, 1);
    stop.resolve();
    await recovery;
    assert.equal(old.held, 0);
    assert.equal(newer.isActive(), false);
    assert.equal(newer.getState().previousOwnerPending, false);
    assert.ok(states.some((state) => state.previousOwnerPending === false));
    startTimerAudio();
    assert.equal(deviceStarts, 1);
  });
}

test('a stale recovery controller cannot stop a newer live or retired account owner', async (t) => {
  let fails = true;
  const old = harness(t, {
    cleanup: async () => {
      old.calls.push('stop');
      return fails ? false : undefined;
    },
  });
  await old.controller.playTrack(song('old'));
  await old.controller.dispose();
  const stale = createAppleMusicCompanionController({ service: old.service });
  const newer = createAppleMusicCompanionController({ service: old.service });
  t.after(() => stale.dispose());
  t.after(() => newer.dispose());
  fails = false;
  await newer.clear();
  await newer.playTrack(song('new'));
  const attempts = old.calls.filter((call) => call === 'stop').length;
  await stale.clear();
  assert.equal(old.calls.filter((call) => call === 'stop').length, attempts);
  assert.equal(newer.getState().ownsQueue, true);
  fails = true;
  await newer.dispose();
  const afterRetirement = old.calls.filter((call) => call === 'stop').length;
  await stale.clear();
  assert.equal(
    old.calls.filter((call) => call === 'stop').length,
    afterRetirement,
    'older controllers cannot clear a newer retired account either',
  );
  const recovery = createAppleMusicCompanionController({ service: old.service });
  t.after(() => recovery.dispose());
  fails = false;
  await recovery.clear();
  assert.equal(recovery.isActive(), false);
});

test('disposing a recovery-only controller does not implicitly retry another account stop', async (t) => {
  let attempts = 0;
  let fail = true;
  const old = harness(t, {
    cleanup: async () => {
      attempts++;
      return fail ? false : undefined;
    },
  });
  await old.controller.playTrack(song('old'));
  await old.controller.dispose();
  let recoveryLease = 0;
  const recoveryOnly = createAppleMusicCompanionController({
    service: old.service,
    acquireBlocker: () => {
      recoveryLease++;
      return () => {
        recoveryLease--;
      };
    },
  });
  recoveryOnly.setVisible(true);
  recoveryOnly.setVisible(false);
  assert.equal(recoveryLease, 1);
  await recoveryOnly.dispose();
  assert.equal(attempts, 1);
  assert.equal(recoveryLease, 0);
  assert.equal(old.held, 1, 'the actual failed owner retains its blocker');
  const current = createAppleMusicCompanionController({ service: old.service });
  t.after(() => current.dispose());
  fail = false;
  await current.clear();
  assert.equal(attempts, 2);
  assert.equal(old.held, 0);
});
