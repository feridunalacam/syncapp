import { useAccountData } from './AccountDataContext';
import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stored, completed] = await Promise.all([
          storage.getJSON(STORAGE_KEYS.ROUTINES, null),
          storage.getJSON(STORAGE_KEYS.COMPLETED_ROUTINES, null),
        ]);
        if (cancelled) return;
        setRoutines(
          Array.isArray(stored)
            ? stored.map(normalizeRoutine)
            : storage.userId
              ? []
              : defaultRoutines,
        );
        if (Array.isArray(completed)) setCompletedRoutines(completed);
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
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    storage.setJSON(STORAGE_KEYS.ROUTINES, routines);
  }, [routines, isLoaded]);

  // Persist workout history. Skip until hydrate completes so we don't
  // overwrite the user's saved log with the seed list on first render.
  useEffect(() => {
    if (!completedHydrated) return;
    storage.setJSON(STORAGE_KEYS.COMPLETED_ROUTINES, completedRoutines);
  }, [completedRoutines, completedHydrated]);

  const addRoutine = useCallback((routineInput) => {
    if (!routineInput) return;

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

    setRoutines((prev) => [...prev, normalizeRoutine(routineToStore)]);
  }, []);

  const updateRoutine = useCallback((updatedRoutine) => {
    setRoutines((prev) =>
      prev.map((routine) =>
        routine.id === updatedRoutine.id
          ? normalizeRoutine({ ...routine, ...updatedRoutine })
          : routine,
      ),
    );
  }, []);

  const reorderRoutines = useCallback((fromIndex, toIndex) => {
    setRoutines((prev) => {
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
    });
  }, []);

  const deleteRoutine = useCallback((id) => {
    setRoutines((prev) => prev.filter((routine) => routine.id !== id));
  }, []);

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
    setRoutines(storage.userId ? [] : defaultRoutines);
    setCompletedRoutines([]);
  }, []);

  const value = useMemo(
    () => ({
      routines,
      isLoaded: isLoaded && completedHydrated,
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
