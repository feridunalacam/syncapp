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
      services: { device: service, spotify: service },
      connectedPlatforms: { spotify: { connected: true, accessToken: 'test-token' } },
      countdownSoundPlayer: { stop: async () => {}, play: async () => {} },
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
    loaded.resolve();
    await Promise.all([play, stop]);
  });
  assert.deepEqual(events, ['play', 'pause']);
  assert.equal(h.audio.track, null);
  assert.equal(h.audio.isMusicPlaying, false);
});

test('returning to preparation stops the previous interval music', async (t) => {
  const h = await mountAudio(t);
  await act(async () => {
    await h.audio.handlePhaseChange('work', 1);
  });
  await act(async () => {
    await h.audio.handlePhaseChange('beforeStart', 0);
  });
  assert.ok(h.calls.some((c) => c[0] === 'pause'));
  assert.equal(h.audio.track, null);
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
