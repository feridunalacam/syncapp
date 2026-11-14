import { summarizeBackup } from './accountStore.js';

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
  const previewIntents = new WeakMap();
  const state = (status, error = null, lastSyncedAt = null) => {
    if (!stopped) onState({ status, error, lastSyncedAt });
  };
  const run = async (choice, intent, intentIsCurrent = () => true) => {
    const allowed = () => canSync() && intentIsCurrent();
    if (!allowed()) {
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
    if (!allowed()) {
      state('paused');
      return;
    }
    const cloud = await remote.read();
    if (stopped) return;
    if (!allowed()) {
      state('paused');
      return;
    }
    const revision = cloud?.revision || 0;
    if (intent) {
      const expected = previewIntents.get(intent);
      const latest = await local.snapshot();
      if (stopped || !allowed())
        throw new Error('Your account or workout changed. Review both copies again.');
      if (!expected || expected.counter !== latest.meta.counter || expected.revision !== revision) {
        conflict = true;
        state('conflict', 'The device or cloud copy changed. Review both copies again.');
        const error = new Error('The device or cloud copy changed. Review both copies again.');
        error.code = 'BACKUP_REVIEW_STALE';
        throw error;
      }
    }
    if (initial.meta.recoveryPending && !choice) {
      conflict = true;
      state('conflict', 'Recovered records are on this device. Review both copies before syncing.');
      return { status: 'conflict' };
    }
    if (choice === 'cloud' || (revision !== initial.meta.revision && !initial.meta.dirty)) {
      if (!cloud) throw new Error('No cloud backup is available.');
      if (
        !(await local.replaceFromCloud(
          cloud.payload,
          revision,
          initial.meta.counter,
          () => !stopped && allowed(),
        ))
      ) {
        if (stopped) return;
        if (!allowed()) {
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
      if (!allowed()) {
        state('paused');
        return;
      }
    } else if (revision !== initial.meta.revision && choice !== 'local') {
      conflict = true;
      state('conflict', 'This device and the cloud both have changes. Choose the copy to keep.');
      return;
    } else if (initial.meta.dirty || choice === 'local') {
      const result = await remote.write(initial.payload, revision);
      if (stopped) return;
      if (!allowed()) {
        state('paused');
        return;
      }
      await local.markSynced(result.revision, initial.meta.counter);
      if (!allowed()) {
        state('paused');
        return;
      }
    }
    // Recovery can commit while an older read/upload is in flight. Its durable
    // manual-choice hold takes precedence over that older request's success.
    const latest = await local.snapshot();
    if (stopped) return;
    if (!allowed()) {
      state('paused');
      return;
    }
    if (pendingReload) {
      pendingReload = false;
      onRestore();
    }
    if (latest.meta.recoveryPending) {
      conflict = true;
      state('conflict', 'Recovered records are on this device. Review both copies before syncing.');
      return { status: 'conflict' };
    }
    conflict = false;
    state('synced', null, new Date().toISOString());
    return { status: 'synced' };
  };
  return {
    async getBackupPreview() {
      if (inFlight) await inFlight;
      if (stopped || !canSync())
        throw new Error('Finish your workout and verify this account before syncing.');
      const initial = await local.snapshot();
      if (stopped || !canSync())
        throw new Error('Your account or workout changed. Review the copies again.');
      const cloud = await remote.read();
      const latest = await local.snapshot();
      if (stopped || !canSync() || latest.meta.counter !== initial.meta.counter)
        throw new Error('Your records changed. Review the copies again.');
      const intent = {};
      previewIntents.set(intent, { counter: initial.meta.counter, revision: cloud?.revision || 0 });
      return {
        local: summarizeBackup(initial.payload, initial.meta.updatedAt || null),
        cloud: cloud ? summarizeBackup(cloud.payload, cloud.updated_at || null) : null,
        intent,
      };
    },
    sync(choice, intent, intentIsCurrent) {
      if (stopped) return Promise.resolve();
      if (inFlight) {
        // An explicit reviewed choice must not be mistaken for an unrelated
        // background request that happened to be running when it was confirmed.
        return choice ? inFlight.then(() => this.sync(choice, intent, intentIsCurrent)) : inFlight;
      }
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
      inFlight = run(choice, intent, intentIsCurrent)
        .catch((error) => {
          if (error.code === 'BACKUP_REVIEW_STALE') {
            conflict = true;
            state('conflict', error.message);
          } else if (error.code === '40001') {
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
