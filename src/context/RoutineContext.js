import { useAccountData } from './AccountDataContext';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import { normalizeRoutine } from '../domain/routines';
import { STORAGE_KEYS } from '../lib/storage';

export const defaultRoutines = [
  { id: 'interval-starter', name: 'Interval Starter', rounds: 3, workSec: 60, restSec: 30 },
  { id: 'quick-burst', name: 'Quick Burst', rounds: 5, workSec: 45, restSec: 15 },
  { id: 'endurance', name: 'Endurance', rounds: 4, workSec: 90, restSec: 30 },
];

const RoutineContext = createContext({
  routines: defaultRoutines,
  addRoutine: () => {},
  updateRoutine: () => {},
  reorderRoutines: () => {},
  deleteRoutine: () => {},
  completedRoutines: [],
  addCompletedRoutine: () => {},
  clearCompletedRoutines: () => {},
});

export const RoutineProvider = ({ children }) => {
  const { storage, reportLoadFailure } = useAccountData();
  const [routines, setRoutines] = useState(defaultRoutines);
  const [completedRoutines, setCompletedRoutines] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [completedHydrated, setCompletedHydrated] = useState(false);
  const ownerRef = useRef(null);
  if (ownerRef.current?.storage !== storage) {
    if (ownerRef.current) ownerRef.current.active = false;
    ownerRef.current = {
      storage,
      active: true,
      ready: false,
      routines: [],
      queue: Promise.resolve(),
    };
  }

  const persistRoutines = useCallback(
    (change, { isCurrent = () => true } = {}) => {
      const owner = ownerRef.current;
      const current = () => owner.active && ownerRef.current === owner && owner.storage === storage;
      const pending = owner.queue.then(async () => {
        if (!current() || !owner.ready || !isCurrent())
          throw new Error('This editor is no longer current. Reopen the routine and try again.');
        const next = change(owner.routines);
        if (next !== owner.routines) {
          let saved;
          try {
            saved = await storage.setJSON(STORAGE_KEYS.ROUTINES, next);
          } catch {
            throw new Error(
              'Could not save this routine on your device. Your draft is still here. Try Save again.',
            );
          }
          if (saved !== true)
            throw new Error(
              'Could not save this routine on your device. Your draft is still here. Try Save again.',
            );
          if (!current()) throw new Error('Your account changed before Save completed.');
          owner.routines = next;
          setRoutines(next);
        }
        return true;
      });
      owner.queue = pending.catch(() => {});
      return pending;
    },
    [storage],
  );

  useEffect(() => {
    let cancelled = false;
    const owner = ownerRef.current;
    owner.active = true;
    setIsLoaded(false);
    setCompletedHydrated(false);
    (async () => {
      try {
        const [stored, completed] = await Promise.all([
          storage.getJSON(STORAGE_KEYS.ROUTINES, null),
          storage.getJSON(STORAGE_KEYS.COMPLETED_ROUTINES, null),
        ]);
        if (cancelled) return;
        const next = Array.isArray(stored)
          ? stored.map(normalizeRoutine)
          : storage.userId
            ? []
            : defaultRoutines;
        owner.routines = next;
        owner.ready = true;
        setRoutines(next);
        setCompletedRoutines(Array.isArray(completed) ? completed : []);
        setIsLoaded(true);
        setCompletedHydrated(true);
      } catch {
        // A read failure is not a new installation. Keep writes disabled until
        // the account's retry gate remounts these providers after recovery.
        if (!cancelled) reportLoadFailure?.();
      }
    })();
    return () => {
      cancelled = true;
      owner.active = false;
    };
  }, [storage]);

  // Persist workout history. Skip until hydrate completes so we don't
  // overwrite the user's saved log with the seed list on first render.
  useEffect(() => {
    if (!completedHydrated || !ownerRef.current.ready) return;
    storage.setJSON(STORAGE_KEYS.COMPLETED_ROUTINES, completedRoutines);
  }, [completedRoutines, completedHydrated]);

  const addRoutine = useCallback(
    (routineInput, options) => {
      if (!routineInput) return Promise.reject(new Error('Choose a routine to save.'));

      const rawName = typeof routineInput.name === 'string' ? routineInput.name.trim() : '';
      const name = rawName || 'Custom Routine';
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const id = `${slug || 'routine'}-${Date.now()}`;

      // Spread the caller's routine so any new field added to the form / schema
      // automatically lands in storage. Defaults cover only the "required" core
      // fields a routine must have to be runnable; identity (id, name) is forced
      // last so callers can't override it accidentally.
      const routineToStore = {
        rounds: 1,
        workSec: 60,
        restSec: 30,
        ...routineInput,
        id,
        name,
      };

      return persistRoutines((prev) => [...prev, normalizeRoutine(routineToStore)], options);
    },
    [persistRoutines],
  );

  const updateRoutine = useCallback(
    (updatedRoutine, options) =>
      persistRoutines((prev) => {
        if (!prev.some((routine) => routine.id === updatedRoutine.id))
          throw new Error('This routine is no longer available. Reopen Training and try again.');
        return prev.map((routine) =>
          routine.id === updatedRoutine.id
            ? normalizeRoutine({ ...routine, ...updatedRoutine })
            : routine,
        );
      }, options),
    [persistRoutines],
  );

  const reorderRoutines = useCallback(
    (fromIndex, toIndex) => {
      return persistRoutines((prev) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex >= prev.length
        ) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      }).catch(() => false);
    },
    [persistRoutines],
  );

  const deleteRoutine = useCallback(
    (id) =>
      persistRoutines((prev) => prev.filter((routine) => routine.id !== id)).catch(() => false),
    [persistRoutines],
  );

  const addCompletedRoutine = useCallback((routine) => {
    setCompletedRoutines((prev) => {
      if (routine.sessionId && prev.some((item) => item.sessionId === routine.sessionId))
        return prev;
      const updated = [routine, ...prev];
      // Keep only the last 100 completed routines to prevent memory bloat
      return updated.slice(0, 100);
    });
  }, []);

  const clearCompletedRoutines = useCallback(() => {
    setCompletedRoutines([]);
  }, []);

  const removeCompletedRoutine = useCallback((routineId, completedAt, sessionId) => {
    setCompletedRoutines((prev) =>
      prev.filter((routine) => {
        if (sessionId) return routine.sessionId !== sessionId;
        if (completedAt) {
          return routine.id !== routineId || routine.completedAt !== completedAt;
        }
        return routine.id !== routineId;
      }),
    );
  }, []);

  // Reset all routine data back to factory defaults. Used by Logout / "wipe
  // everything" so the next user starts from a clean slate.
  const resetRoutinesToDefaults = useCallback(() => {
    setCompletedRoutines([]);
    return persistRoutines(() => (storage.userId ? [] : defaultRoutines)).catch(() => false);
  }, [storage, persistRoutines]);

  const value = useMemo(
    () => ({
      saveOwner: ownerRef.current,
      routines: ownerRef.current.ready ? routines : storage.userId ? [] : defaultRoutines,
      isLoaded: ownerRef.current.ready && isLoaded && completedHydrated,
      addRoutine,
      updateRoutine,
      reorderRoutines,
      deleteRoutine,
      completedRoutines,
      addCompletedRoutine,
      clearCompletedRoutines,
      removeCompletedRoutine,
      resetRoutinesToDefaults,
    }),
    [
      storage,
      isLoaded,
      completedHydrated,
      routines,
      addRoutine,
      updateRoutine,
      reorderRoutines,
      deleteRoutine,
      completedRoutines,
      addCompletedRoutine,
      clearCompletedRoutines,
      removeCompletedRoutine,
      resetRoutinesToDefaults,
    ],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
};

export const useRoutineContext = () => useContext(RoutineContext);
