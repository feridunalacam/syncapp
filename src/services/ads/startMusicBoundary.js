const skipped = (reason, extra = {}) => ({ shown: false, reason, ...extra });

/** Only an explicit, idle-timer Start opportunity may borrow companion silence. */
export async function showStartMusicOpportunity({
  ads,
  player,
  opportunityId,
  isEligible,
  isCurrent = isEligible,
  getAppState,
  waitForForeground,
  onPreparing = () => {},
}) {
  if (!isEligible()) return skipped('cancelled', { cancelled: true });
  if (player?.isActive?.() !== true) {
    // Public eligibility is correct here: there is no music-owned lease to yield.
    return ads.accountEligible === true
      ? ads.showInterstitial({ opportunityId, isEligible })
      : skipped('ineligible');
  }
  // This reads retained eligibility/cache only; Pro/unknown must not pause music
  // or load consent, initialize the SDK, request a creative, or present anything.
  if (ads.canPrepareMusicStartAd?.() !== true || typeof player.beginStartAdBoundary !== 'function')
    return skipped('not-prepared');
  let ticket;
  let ad = skipped('not-ready');
  let outcome = ad;
  let presenterSafe = false;
  onPreparing(true);
  try {
    // Native interstitials may make iOS inactive. Foreground remains a show
    // gate, while this lineage guard survives only that expected transition.
    ticket = await player.beginStartAdBoundary({ isCurrent });
    if (!ticket) outcome = skipped('cancelled', { cancelled: true });
    else if (ticket.success === false) outcome = skipped('music-not-paused');
    else if (!ticket.isCurrent()) outcome = skipped('cancelled', { cancelled: true });
    else {
      try {
        ad =
          (await ads.showStartInterstitial({
            opportunityId,
            isEligible: () => isEligible() && ticket.isCurrent(),
            beforePresent: () => ticket.beforePresent(),
          })) || ad;
      } catch {
        // A wrapper can throw after requesting presentation. Always drain the
        // actual native presenter before restoring music or starting the timer.
        ad = skipped('presentation-error');
      }
      await ads.waitForAdPresenters();
      presenterSafe = true;
      if (ad.shown === true && getAppState() === 'inactive') await waitForForeground();
      outcome =
        !isEligible() || !ticket.isCurrent()
          ? { ...ad, cancelled: true }
          : { ...ad, isCurrent: () => isEligible() && ticket.isCurrent() };
    }
  } catch {
    outcome = { ...ad, cancelled: true, reason: 'presentation-unsafe' };
  } finally {
    try {
      if (ticket && ticket.success !== false) {
        // finish restores its OWN lease synchronously. It also retains/drains
        // native presenter barriers before any conditional audible resume.
        const restored = await ticket.finish({
          resume: presenterSafe && isEligible() && ticket.isCurrent(),
        });
        if (restored === false || restored?.success === false || restored?.cancelled === true)
          outcome = { ...outcome, cancelled: true, reason: 'music-restore-cancelled' };
      }
    } catch {
      outcome = { ...outcome, cancelled: true, reason: 'music-restore-unsafe' };
    } finally {
      onPreparing(false);
    }
  }
  return outcome;
}
