import test from 'node:test';
import assert from 'node:assert/strict';
import { showStartMusicOpportunity } from '../src/services/ads/startMusicBoundary.js';
import { createSessionAdActions } from '../src/services/ads/sessionActions.js';

test('wrapper carries every checked cancelled/failed restore into the real Session continuation', async () => {
  for (const finishResult of [false, { success: false }, { success: true, cancelled: true }]) {
    const routine = { id: 'routine' };
    let starts = 0;
    let held = false;
    const ticket = {
      isCurrent: () => true,
      beforePresent: () => true,
      finish: async () => finishResult,
    };
    const ads = {
      accountEligible: false,
      canPrepareMusicStartAd: () => true,
      showStartInterstitial: async ({ beforePresent }) => {
        assert.equal(beforePresent(), true);
        return { shown: true };
      },
      waitForAdPresenters: async () => {},
    };
    const actions = createSessionAdActions({
      getState: () => ({
        identity: 'account',
        routine,
        active: false,
        sessionKey: null,
        focused: true,
        appActive: true,
        blocked: false,
        musicPlaying: false,
        audioSyncing: false,
      }),
      stopAudioPreview: async () => {},
      waitForAdsIdle: async () => {},
      showStartAd: (options) =>
        showStartMusicOpportunity({
          ...options,
          ads,
          player: { isActive: () => true, beginStartAdBoundary: async () => ticket },
          getAppState: () => 'active',
          waitForForeground: async () => true,
          onPreparing: (value) => {
            held = value;
          },
        }),
      startSession: () => {
        starts++;
      },
    });
    const result = await actions.start({ opportunityId: 'start' });
    assert.equal(result.performed, false);
    assert.equal(result.shown, true);
    assert.equal(starts, 0);
    assert.equal(held, false);
    actions.dispose();
  }
});
