import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useAudioController } from '../src/hooks/useAudioController.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const success = { success: true };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function mountAudio(t, overrides = {}, configuration = {}) {
  const calls = [];
  const service = {
    getActiveDevice: async () => 'device',
    playTrack: async (token, uri) => {
      calls.push(['play', uri]);
      return success;
    },
    playPlaylist: async () => success,
    pause: async () => {
      calls.push(['pause']);
      return success;
    },
    play: async () => {
      calls.push(['resume']);
      return success;
    },
    cleanup: async () => {
      calls.push(['cleanup']);
    },
    getCurrentPlayback: async () => null,
    ...overrides,
  };
  let audio;
  const routine = {
    rounds: 2,
    roundsData: [
      {
        workSong: { uri: 'file:///one.mp3', name: 'One' },
        restSong: { uri: 'file:///rest.mp3', name: 'Rest' },
      },
      { workSong: { uri: 'file:///two.mp3', name: 'Two' } },
    ],
  };
  function Harness() {
    audio = useAudioController({
      selectedRoutine: configuration.routine || routine,
      services: {
        device: service,
        spotify: service,
        appleMusic: { ...service, allowsLocalCues: false, localPlaybackControl: true },
      },
      connectedPlatforms: {
        spotify: { connected: true, accessToken: 'test-token' },
        appleMusic: { connected: true, accessToken: 'native:appleMusic' },
      },
      countdownSoundPlayer: configuration.countdownSoundPlayer || {
        stop: async () => {},
        play: async () => {},
      },
      stopLocalCues: configuration.stopLocalCues,
      onPlaybackInterrupted: configuration.onPlaybackInterrupted,
      getValidAccessToken: configuration.getValidAccessToken,
    });
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
    get audio() {
      return audio;
    },
    calls,
  };
}

test('a phase selected while paused waits for resume before starting audio', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1, true);
  });
  assert.equal(h.calls.filter((c) => c[0] === 'play').length, 0);
  await act(async () => {
    await h.audio.resumeMusic();
  });
  assert.deepEqual(
    h.calls.find((c) => c[0] === 'play'),
    ['play', 'file:///one.mp3'],
  );
});

test('a slow playback metadata read cannot hold an already-started interval or the next transition', async (t) => {
  const read = deferred();
  const prepared = [];
  let reads = 0;
  const h = await mountAudio(t, {
    getCurrentPlayback: () =>
      ++reads === 1 ? read.promise : Promise.resolve({ item: { name: 'Rest' }, is_playing: true }),
    prepareTrack: async (_token, uri) => prepared.push(uri),
  });
  let firstReady = false;
  await act(async () => {
    h.audio.handlePhaseChange('work', 1).then(() => {
      firstReady = true;
    });
  });
  assert.equal(firstReady, true);
  assert.deepEqual(prepared, ['file:///rest.mp3']);
  let restReady = false;
  await act(async () => {
    h.audio.handlePhaseChange('rest', 1).then(() => {
      restReady = true;
    });
  });
  assert.equal(restReady, true);
  assert.equal(h.audio.track.title, 'Rest');
  await act(async () => {
    read.resolve({ item: { name: 'Retired metadata' }, is_playing: true });
  });
  assert.equal(h.audio.track.title, 'Rest');
});

test('Apple Music work/rest transitions, pause/resume and local-cue ownership use the shared controller', async (t) => {
  const cues = [];
  const h = await mountAudio(
    t,
    {},
    {
      routine: {
        roundsData: [
          {
            workSong: { uri: 'apple-music:song:123', platform: 'appleMusic' },
            restSong: { uri: 'file:///rest.mp3', platform: 'device' },
          },
        ],
      },
      stopLocalCues: async () => cues.push('stop'),
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  assert.equal(h.audio.localCuesAllowed, false);
  assert.deepEqual(
    h.calls.find((call) => call[0] === 'play'),
    ['play', 'apple-music:song:123'],
  );
  await act(async () => h.audio.pauseMusic());
  assert.equal(h.audio.isMusicPlaying, false);
  await act(async () => h.audio.resumeMusic());
  assert.equal(h.audio.isMusicPlaying, true);
  await act(async () => h.audio.handlePhaseChange('rest', 1));
  assert.equal(h.audio.localCuesAllowed, true);
  assert.ok(h.calls.some((call) => call[0] === 'play' && call[1] === 'file:///rest.mp3'));
  assert.deepEqual(cues, ['stop']);
  await act(async () => h.audio.stopMusic());
  assert.equal(h.audio.isMusicPlaying, false);
});

test('Apple pause and stop remain local when subscription or permission verification fails', async (t) => {
  let rejected = false,
    checks = 0;
  const h = await mountAudio(
    t,
    {},
    {
      routine: {
        rounds: 2,
        roundsData: [{ workSong: { uri: 'apple-music:song:123', platform: 'appleMusic' } }],
      },
      getValidAccessToken: async () => {
        checks++;
        if (rejected) throw new Error('Subscription unavailable');
        return 'native:appleMusic';
      },
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  rejected = true;
  const before = checks;
  await act(async () => h.audio.pauseMusic());
  assert.equal(h.audio.isMusicPlaying, false);
  await act(async () => h.audio.stopMusic());
  assert.equal(h.audio.audioError, null);
  assert.equal(
    checks,
    before,
    'local stop must not depend on subscription checks or a network response',
  );
  assert.ok(h.calls.some(([event]) => event === 'pause'));
  assert.ok(h.calls.some(([event]) => event === 'cleanup'));
});

test('revoked Apple access cannot block switching to Device audio while new Apple starts still fail closed', async (t) => {
  let rejected = false;
  const h = await mountAudio(
    t,
    {},
    {
      routine: {
        rounds: 2,
        roundsData: [
          {
            workSong: { uri: 'apple-music:song:123', platform: 'appleMusic' },
            restSong: { uri: 'file:///rest.mp3', name: 'Local rest', platform: 'device' },
          },
          { workSong: { uri: 'apple-music:song:456', platform: 'appleMusic' } },
        ],
      },
      getValidAccessToken: async () => {
        if (rejected) throw new Error('Music permission denied');
        return 'native:appleMusic';
      },
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  rejected = true;
  await act(async () => h.audio.handlePhaseChange('rest', 1));
  assert.equal(h.audio.audioError, null);
  assert.equal(h.audio.track.title, 'Local rest');
  assert.ok(h.calls.some(([event, uri]) => event === 'play' && uri === 'file:///rest.mp3'));
  await act(async () => h.audio.handlePhaseChange('work', 2));
  assert.match(h.audio.audioError, /permission denied/);
  assert.equal(
    h.calls.some(([event, uri]) => event === 'play' && uri === 'apple-music:song:456'),
    false,
  );
});

test('Spotify preparation stops local cues before playback and blocks legacy overlay alerts', async (t) => {
  const cuesStopped = deferred();
  const calls = [];
  const h = await mountAudio(
    t,
    {},
    {
      routine: {
        countdownBeforeStartSound: { uri: 'voices://beep_short' },
        roundsData: [{ workSong: { uri: 'spotify:track:one', platform: 'spotify' } }],
      },
      stopLocalCues: () => {
        calls.push('stop-cues');
        return cuesStopped.promise;
      },
      countdownSoundPlayer: {
        stop: async () => calls.push('stop-legacy'),
        play: async () => calls.push('play-legacy'),
      },
    },
  );
  let operation;
  await act(async () => {
    operation = h.audio.handlePhaseChange('beforeStart', 0);
  });
  assert.equal(h.audio.localCuesAllowed, false);
  assert.equal(h.calls.filter((call) => call[0] === 'play').length, 0);
  await act(async () => h.audio.playCountdownSound('beforeStart'));
  assert.equal(calls.includes('play-legacy'), false);
  await act(async () => {
    cuesStopped.resolve();
    await operation;
  });
  assert.equal(h.calls.filter((call) => call[0] === 'play').length, 1);
  assert.equal(h.audio.localCuesAllowed, false);
  await act(async () => h.audio.handlePhaseChange('work', 1));
  assert.equal(h.audio.localCuesAllowed, false);
});

test('Device preparation keeps local cues available when the same song continues into Work', async (t) => {
  const h = await mountAudio(t);
  await act(async () => h.audio.handlePhaseChange('beforeStart', 0));
  assert.equal(h.audio.localCuesAllowed, true);
  await act(async () => h.audio.handlePhaseChange('work', 1));
  assert.equal(h.audio.localCuesAllowed, true);
  assert.equal(h.calls.filter((call) => call[0] === 'play').length, 1);
});

test('mixed routines wait for Spotify pause before local music and cues become eligible', async (t) => {
  const paused = deferred();
  let holdPause = false;
  const h = await mountAudio(
    t,
    { pause: () => (holdPause ? paused.promise : Promise.resolve(success)) },
    {
      routine: {
        roundsData: [
          {
            workSong: { uri: 'spotify:track:one', platform: 'spotify' },
            restSong: { uri: 'file:///rest.mp3', platform: 'device' },
          },
        ],
      },
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  holdPause = true;
  let operation;
  await act(async () => {
    operation = h.audio.handlePhaseChange('rest', 1);
  });
  assert.equal(h.audio.localCuesAllowed, false);
  assert.equal(h.calls.filter((call) => call[0] === 'play').length, 1);
  await act(async () => {
    paused.resolve(success);
    await operation;
  });
  assert.equal(h.audio.localCuesAllowed, true);
  assert.deepEqual(
    h.calls.filter((call) => call[0] === 'play').map((call) => call[1]),
    ['spotify:track:one', 'file:///rest.mp3'],
  );
});

test('a failed Spotify pause retains ownership until a successful retry', async (t) => {
  let failing = true;
  let pauses = 0;
  const h = await mountAudio(
    t,
    {
      pause: async () => {
        pauses++;
        return failing ? { success: false, error: 'Offline' } : success;
      },
    },
    { routine: { roundsData: [{ workSong: { uri: 'spotify:track:one', platform: 'spotify' } }] } },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  await act(async () => {
    const result = await h.audio.handlePhaseChange('rest', 1);
    assert.equal(result.success, false);
  });
  assert.equal(h.audio.localCuesAllowed, false);
  failing = false;
  await act(async () => h.audio.handlePhaseChange('rest', 1));
  assert.equal(pauses, 2);
  assert.equal(h.audio.localCuesAllowed, true);
});

test('an older stop cannot re-enable cues for a newer Spotify start', async (t) => {
  const paused = deferred();
  const h = await mountAudio(
    t,
    { pause: () => paused.promise },
    {
      routine: {
        roundsData: [
          { workSong: { uri: 'spotify:track:first', platform: 'spotify' } },
          { workSong: { uri: 'spotify:track:second', platform: 'spotify' } },
        ],
      },
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  let stopped;
  let started;
  await act(async () => {
    stopped = h.audio.stopMusic();
    started = h.audio.handlePhaseChange('work', 2);
  });
  await act(async () => {
    paused.resolve(success);
    await Promise.all([stopped, started]);
  });
  assert.equal(h.audio.localCuesAllowed, false);
  assert.equal(h.audio.track.id, 'spotify:track:second');
});

test('rapid phase changes only load the latest requested source', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    const one = h.audio.handlePhaseChange('work', 1);
    const two = h.audio.handlePhaseChange('work', 2);
    await Promise.all([one, two]);
  });
  assert.deepEqual(
    h.calls.filter((c) => c[0] === 'play'),
    [['play', 'file:///two.mp3']],
  );
});

test('stopping during a pending load leaves playback stopped and metadata cleared', async (t) => {
  const loaded = deferred();
  const started = deferred();
  const events = [];
  const h = await mountAudio(t, {
    playTrack: async () => {
      events.push('play');
      started.resolve();
      await loaded.promise;
      return success;
    },
    pause: async () => {
      events.push('pause');
      return success;
    },
  });
  await act(async () => {
    const play = h.audio.handlePhaseChange('work', 1);
    await started.promise;
    const stop = h.audio.stopMusic();
    await new Promise(setImmediate);
    assert.ok(events.includes('pause'), 'stop must reach the player before loading finishes');
    loaded.resolve();
    await Promise.all([play, stop]);
  });
  assert.equal(events[0], 'play');
  assert.ok(events.slice(1).every((event) => event === 'pause'));
  assert.ok(events.length >= 2);
  assert.equal(h.audio.track, null);
  assert.equal(h.audio.isMusicPlaying, false);
});

test('returning to preparation starts the first Work track as a new intro', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  assert.ok(h.calls.some((c) => c[0] === 'pause'));
  assert.equal(h.audio.track.title, 'One');
  assert.equal(h.calls.filter((c) => c[0] === 'play').length, 2);
});

test('a failed source does not block later audio commands', async (t) => {
  const h = await mountAudio(t, {
    playTrack: async (token, uri) =>
      uri.includes('one') ? { success: false, error: 'Missing file' } : success,
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  assert.equal(h.audio.audioError, 'Missing file');
  await act(async () => {
    await h.audio.handlePhaseChange('work', 2);
  });
  assert.equal(h.audio.audioError, null);
  assert.equal(h.audio.track.title, 'Two');
});

test('repeating an assigned song repeats the track rather than its album', async (t) => {
  const modes = [];
  const h = await mountAudio(t, {
    setRepeat: async (_token, mode) => {
      modes.push(mode);
      return success;
    },
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  await act(async () => {
    await h.audio.toggleRepeat();
  });
  assert.deepEqual(modes, ['off', 'track']);
});

test('ending playback targets the device used to start the round', async (t) => {
  const targets = [];
  const h = await mountAudio(t, {
    pause: async (_token, _refresh, deviceId) => {
      targets.push(deviceId);
      return success;
    },
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  await act(async () => {
    await h.audio.stopMusic();
  });
  assert.deepEqual(targets, ['device']);
});

test('resuming after a device change preserves the Spotify context on the new device', async (t) => {
  let device = 'first';
  const plays = [];
  const resumes = [];
  const uri = 'spotify:track:chosen';
  const h = await mountAudio(
    t,
    {
      getActiveDevice: async () => device,
      playTrack: async (_token, source, target, options) => {
        plays.push({ source, target, position: options.positionMs });
        return success;
      },
      getCurrentPlayback: async () => ({
        device: { id: device },
        is_playing: true,
        progress_ms: 12700,
        item: { uri, name: 'Chosen', duration_ms: 180000 },
      }),
      pause: async () =>
        device === 'first' ? success : { success: false, code: 'DEVICE_CHANGED' },
      play: async (_token, target) => {
        resumes.push(target);
        return success;
      },
    },
    { routine: { roundsData: [{ workSong: { uri, name: 'Chosen' } }] } },
  );
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  device = 'second';
  await act(async () => {
    await h.audio.pauseMusic();
  });
  await act(async () => {
    await h.audio.resumeMusic();
  });
  assert.equal(plays.length, 1);
  assert.deepEqual(resumes, ['second']);
  assert.equal(h.audio.audioError, null);
});

test('an old playing response cannot undo a requested pause', async (t) => {
  const playback = deferred();
  let delayed = false;
  const h = await mountAudio(t, {
    getCurrentPlayback: async () => (delayed ? playback.promise : null),
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  delayed = true;
  await act(async () => {
    const poll = h.audio.fetchPlayback();
    await h.audio.pauseMusic();
    playback.resolve({ is_playing: true, item: { uri: 'file:///one.mp3', name: 'One' } });
    await poll;
  });
  assert.equal(h.audio.isMusicPlaying, false);
});

test('preparation starts quietly and Work raises volume without restarting the song', async (t) => {
  const events = [];
  const h = await mountAudio(
    t,
    {
      playTrack: async (_token, uri, _device, options) => {
        events.push(['play', uri, options.volumePercent]);
        return success;
      },
      setVolume: async (_token, volume) => {
        events.push(['volume', volume]);
        return success;
      },
      getCurrentPlayback: async () => ({
        item: { uri: 'file:///one.mp3', name: 'One' },
        progress_ms: 4300,
        is_playing: true,
      }),
    },
    {
      routine: {
        preparationVolume: 50,
        workVolume: 80,
        roundsData: [{ workSong: { uri: 'file:///one.mp3', name: 'One' } }],
      },
    },
  );
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  assert.deepEqual(events, [
    ['play', 'file:///one.mp3', 50],
    ['volume', 50],
    ['volume', 80],
  ]);
  assert.equal(h.calls.filter((c) => c[0] === 'pause' || c[0] === 'cleanup').length, 0);
  assert.equal(h.audio.musicProgress, 4.3);
  assert.equal(h.audio.isMusicPlaying, true);
});

test('a paused preparation-to-Work transition keeps the same loaded track for resume', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  await act(async () => {
    await h.audio.pauseMusic();
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1, true);
  });
  assert.equal(h.audio.isMusicPlaying, false);
  await act(async () => {
    await h.audio.resumeMusic();
  });
  assert.equal(h.calls.filter((c) => c[0] === 'play').length, 1);
  assert.equal(h.calls.filter((c) => c[0] === 'resume').length, 1);
});

test('Spotify gets the preparation level before playback and preserves the playlist at Work', async (t) => {
  const events = [];
  const h = await mountAudio(
    t,
    {
      setVolume: async (_token, volume) => {
        events.push(['volume', volume]);
        return success;
      },
      playPlaylist: async () => {
        events.push(['playlist']);
        return success;
      },
    },
    { routine: { workoutPlaylistId: 'playlist', platform: 'spotify', preparationVolume: 35 } },
  );
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  assert.deepEqual(events, [['volume', 35], ['playlist'], ['volume', 35], ['volume', 100]]);
  assert.equal(h.audio.audioError, null);
});

test('Spotify devices without volume support still continue the same track', async (t) => {
  const h = await mountAudio(
    t,
    {
      setVolume: async () => ({ success: true, skipped: true }),
    },
    { routine: { roundsData: [{ workSong: { uri: 'spotify:track:chosen' } }] } },
  );
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  assert.equal(h.calls.filter((c) => c[0] === 'play').length, 1);
  assert.equal(h.audio.audioError, null);
});

test('a queued preparation request cannot replace a newer Work request', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    await Promise.all([
      h.audio.handlePhaseChange('beforeStart', 0),
      h.audio.handlePhaseChange('work', 1),
    ]);
  });
  assert.equal(h.calls.filter((c) => c[0] === 'play').length, 1);
});

test('confirmed external pause notifies the workout while a brief handoff gap does not', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let playback = { item: { uri: 'file:///one.mp3' }, is_playing: true };
  const notices = [];
  const h = await mountAudio(
    t,
    { getCurrentPlayback: async () => playback },
    {
      onPlaybackInterrupted: (reason) => notices.push(reason),
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  playback = null;
  await act(async () => h.audio.fetchPlayback());
  playback = { item: { uri: 'file:///one.mp3' }, is_playing: true };
  now = 2000;
  await act(async () => h.audio.fetchPlayback());
  assert.equal(notices.length, 0);
  playback = { item: { uri: 'file:///one.mp3' }, is_playing: false };
  await act(async () => h.audio.fetchPlayback());
  now = 3000;
  await act(async () => h.audio.fetchPlayback());
  assert.equal(notices.length, 1);
});

test('an unavailable audio source reports interruption instead of silently advancing', async (t) => {
  let failed = false;
  const notices = [];
  const h = await mountAudio(
    t,
    {
      getCurrentPlayback: async () =>
        failed
          ? { success: false, error: 'Connection lost' }
          : { item: { uri: 'file:///one.mp3' }, is_playing: true },
    },
    {
      onPlaybackInterrupted: (reason) => notices.push(reason),
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  failed = true;
  await act(async () => h.audio.fetchPlayback());
  assert.deepEqual(notices, ['Connection lost']);
});

test('manual pause is not mistaken for an external playback interruption', async (t) => {
  const notices = [];
  const h = await mountAudio(
    t,
    { getCurrentPlayback: async () => null },
    {
      onPlaybackInterrupted: (reason) => notices.push(reason),
    },
  );
  await act(async () => h.audio.handlePhaseChange('work', 1));
  await act(async () => h.audio.pauseMusic());
  await act(async () => h.audio.fetchPlayback());
  assert.equal(notices.length, 0);
});

test('cancelling a native load does not show a spurious no-track pause error', async (t) => {
  const loaded = deferred();
  const started = deferred();
  let loading = true;
  const h = await mountAudio(t, {
    playTrack: async (token, uri, device, options) => {
      started.resolve();
      await loaded.promise;
      loading = false;
      return { success: true, cancelled: options.isCancelled() };
    },
    pause: async () => (loading ? success : { success: false, error: 'No track loaded' }),
  });
  await act(async () => {
    const play = h.audio.handlePhaseChange('work', 1);
    await started.promise;
    const pause = h.audio.pauseMusic();
    loaded.resolve();
    await Promise.all([play, pause]);
  });
  assert.equal(h.audio.audioError, null);
  assert.equal(h.audio.isMusicPlaying, false);
});

test('an obsolete failed load cannot replace the next interval with an error', async (t) => {
  const first = deferred();
  const started = deferred();
  const h = await mountAudio(t, {
    playTrack: async (token, uri) => {
      if (uri === 'file:///one.mp3') {
        started.resolve();
        await first.promise;
        throw new Error('Old source failed');
      }
      return success;
    },
  });
  await act(async () => {
    const one = h.audio.handlePhaseChange('work', 1);
    await started.promise;
    const two = h.audio.handlePhaseChange('work', 2);
    first.resolve();
    await Promise.all([one, two]);
  });
  assert.equal(h.audio.audioError, null);
  assert.equal(h.audio.track.title, 'Two');
});
