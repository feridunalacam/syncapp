import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import storage, { STORAGE_KEYS } from '../lib/storage';

export const defaultRoutines = [
  { id: 'deneme', name: 'deneme', rounds: 3, workSec: 60, restSec: 30 },
  { id: 'deneme-copy', name: 'deneme (copy)', rounds: 3, workSec: 60, restSec: 30 },
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

// Seed the Log screen with two example completed entries so a brand-new
// install isn't entirely empty. Real completions overwrite these on first
// hydrate.
const getExampleCompletedRoutines = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 18, 15);

  return [
    { ...defaultRoutines[0], completedAt: today.toISOString() },
    { ...defaultRoutines[0], completedAt: yesterday.toISOString() },
  ];
};

const initialCompletedRoutines = getExampleCompletedRoutines();

export const RoutineProvider = ({ children }) => {
  const [routines, setRoutines] = useState(defaultRoutines);
  const [completedRoutines, setCompletedRoutines] = useState(initialCompletedRoutines);
  const [isLoaded, setIsLoaded] = useState(false);
  const [completedHydrated, setCompletedHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // One-time reset to clear old routines and set the new default.
      const hasBeenReset = await storage.getString(STORAGE_KEYS.ROUTINES_RESET_FLAG);
      if (!hasBeenReset) {
        await storage.remove(STORAGE_KEYS.ROUTINES);
        await storage.setString(STORAGE_KEYS.ROUTINES_RESET_FLAG, 'true');
        if (!cancelled) {
          setRoutines(defaultRoutines);
          setIsLoaded(true);
        }
        return;
      }

      const stored = await storage.getJSON(STORAGE_KEYS.ROUTINES, null);
      if (cancelled) return;

      if (Array.isArray(stored) && stored.length > 0) {
        setRoutines(stored);
      } else {
        setRoutines(defaultRoutines);
      }
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate completed routines (workout history). Without this, the Log
  // screen wiped itself on every app restart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await storage.getJSON(STORAGE_KEYS.COMPLETED_ROUTINES, null);
      if (cancelled) return;
      if (Array.isArray(stored)) {
        setCompletedRoutines(stored);
      }
      setCompletedHydrated(true);
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

    setRoutines((prev) => [...prev, routineToStore]);
  }, []);

  const updateRoutine = useCallback((updatedRoutine) => {
    setRoutines((prev) =>
      prev.map((routine) => (routine.id === updatedRoutine.id ? { ...routine, ...updatedRoutine } : routine)),
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
      const updated = [routine, ...prev];
      // Keep only the last 100 completed routines to prevent memory bloat
      return updated.slice(0, 100);
    });
  }, []);

  const clearCompletedRoutines = useCallback(() => {
    setCompletedRoutines([]);
  }, []);

  const removeCompletedRoutine = useCallback((routineId, completedAt) => {
    setCompletedRoutines((prev) =>
      prev.filter((routine) => {
        if (completedAt) {
          return routine.completedAt !== completedAt;
        }
        return routine.id !== routineId;
      }),
    );
  }, []);

  // Reset all routine data back to factory defaults. Used by Logout / "wipe
  // everything" so the next user starts from a clean slate.
  const resetRoutinesToDefaults = useCallback(() => {
    setRoutines(defaultRoutines);
    setCompletedRoutines([]);
  }, []);

  const value = useMemo(
    () => ({
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
    }),
    [
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


