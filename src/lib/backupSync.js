export function createBackupSync({
  local,
  remote,
  onState = () => {},
  onRestore = () => {},
  canSync = () => true,
}) {
  let inFlight = null;
  let stopped = false;
  let conflict = false;
  let pendingReload = false;
  const state = (status, error = null, lastSyncedAt = null) => {
    if (!stopped) onState({ status, error, lastSyncedAt });
  };
  const run = async (choice) => {
    if (!canSync()) {
      state('paused');
      return;
    }
    if (pendingReload) {
      // A replacement may have committed immediately before a workout paused
      // synchronization. Refresh consumers only once idle, before further work.
      pendingReload = false;
      onRestore();
    }
    state('syncing');
    const initial = await local.snapshot();
    if (stopped) return;
    if (!canSync()) {
      state('paused');
      return;
    }
    const cloud = await remote.read();
    if (stopped) return;
    if (!canSync()) {
      state('paused');
      return;
    }
    const revision = cloud?.revision || 0;
    if (choice === 'cloud' || (revision !== initial.meta.revision && !initial.meta.dirty)) {
      if (!cloud) throw new Error('No cloud backup is available.');
      if (
        !(await local.replaceFromCloud(
          cloud.payload,
          revision,
          initial.meta.counter,
          () => !stopped && canSync(),
        ))
      ) {
        if (stopped) return;
        if (!canSync()) {
          state('paused');
          return;
        }
        conflict = true;
        state('conflict', 'Your records changed during sync. Choose the copy to keep.');
        return;
      }
      if (stopped) return;
      conflict = false;
      pendingReload = true;
      if (!canSync()) {
        state('paused');
        return;
      }
      pendingReload = false;
      onRestore();
    } else if (revision !== initial.meta.revision && choice !== 'local') {
      conflict = true;
      state('conflict', 'This device and the cloud both have changes. Choose the copy to keep.');
      return;
    } else if (initial.meta.dirty || choice === 'local') {
      const result = await remote.write(initial.payload, revision);
      if (stopped) return;
      await local.markSynced(result.revision, initial.meta.counter);
    }
    conflict = false;
    state('synced', null, new Date().toISOString());
  };
  return {
    sync(choice) {
      if (stopped) return Promise.resolve();
      if (inFlight) return inFlight;
      if (conflict && !choice) {
        // A workout can interrupt an explicit copy choice. Restore the choice
        // controls once idle instead of leaving the UI permanently paused.
        const allowed = canSync();
        state(
          allowed ? 'conflict' : 'paused',
          allowed ? 'Choose the device or cloud copy to continue syncing.' : null,
        );
        return Promise.resolve();
      }
      inFlight = run(choice)
        .catch((error) => {
          if (error.code === '40001') {
            conflict = true;
            state('conflict', 'The cloud copy changed during sync. Choose the copy to keep.');
          } else
            state('error', error.message || 'Could not sync. Your records remain on this device.');
          throw error;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    stop() {
      stopped = true;
    },
  };
}
