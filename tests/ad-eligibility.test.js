import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseAdsAccount, canPrepareAds, canShowBanner } from '../src/services/ads/eligibility.js';

const free = {
  authReady: true,
  userId: 'account-a',
  subscriptionUserId: 'account-a',
  subscriptionReady: true,
  accessVerified: true,
  isPro: false,
  pending: false,
  loading: false,
};
const safePlacement = {
  accountEligible: true,
  appActive: true,
  screenFocused: true,
  placementVisible: true,
  hasBlockingModal: false,
  isWorkoutRunning: false,
  isMusicPlaying: false,
  isAudioSyncing: false,
};

test('only stable guests or current backend-verified Free accounts are ad eligible', () => {
  assert.equal(canUseAdsAccount(free), true);
  assert.equal(
    canUseAdsAccount({ ...free, userId: null, subscriptionUserId: null, accessVerified: false }),
    true,
  );
  for (const changes of [
    { authReady: false },
    { subscriptionReady: false },
    { accessVerified: false },
    { subscriptionUserId: 'account-b' },
    { subscriptionUserId: null },
    { isPro: true },
    { pending: true },
    { loading: true },
    { userId: null },
    { userId: '' },
    { userId: undefined, subscriptionUserId: undefined },
  ])
    assert.equal(canUseAdsAccount({ ...free, ...changes }), false, JSON.stringify(changes));
});

test('account eligibility fails closed for every omitted safety signal', () => {
  assert.equal(canUseAdsAccount(), false);
  for (const key of Object.keys(free)) {
    const incomplete = { ...free };
    delete incomplete[key];
    assert.equal(canUseAdsAccount(incomplete), false, key);
  }
});

test('initialization and consent loading require a safe visible foreground placement', () => {
  assert.equal(canPrepareAds(safePlacement), true);
  assert.equal(canPrepareAds(), false);
  for (const changes of [
    { accountEligible: false },
    { appActive: false },
    { screenFocused: false },
    { placementVisible: false },
    { hasBlockingModal: true },
    { isWorkoutRunning: true },
    { isMusicPlaying: true },
    { isAudioSyncing: true },
  ])
    assert.equal(canPrepareAds({ ...safePlacement, ...changes }), false, JSON.stringify(changes));
});

test('unknown workout/audio/placement state cannot trigger SDK or consent loading', () => {
  for (const key of Object.keys(safePlacement).filter((key) => key !== 'hasBlockingModal')) {
    const incomplete = { ...safePlacement };
    delete incomplete[key];
    assert.equal(canPrepareAds(incomplete), false, key);
  }
});

test('banner requires SDK readiness and consent plus a fresh eligibility check', () => {
  const ready = { ...safePlacement, consentReady: true, sdkReady: true };
  assert.equal(canShowBanner(ready), true);
  assert.equal(canShowBanner(), false);
  for (const changes of [
    { consentReady: false },
    { consentReady: undefined },
    { sdkReady: false },
    { sdkReady: undefined },
    { accountEligible: false },
    { hasBlockingModal: true },
    { appActive: false },
    { screenFocused: false },
    { isWorkoutRunning: true },
    { isMusicPlaying: true },
    { isAudioSyncing: true },
  ])
    assert.equal(canShowBanner({ ...ready, ...changes }), false, JSON.stringify(changes));
});
