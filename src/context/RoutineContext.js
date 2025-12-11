import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Memoize example completed routines to avoid recreating on every render
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

  // Load routines from AsyncStorage on mount
  useEffect(() => {
    const loadRoutines = async () => {
      try {
        // One-time reset to clear old routines and set the new default.
        const hasBeenReset = await AsyncStorage.getItem('routines-reset-deneme-v1');
        if (!hasBeenReset) {
          await AsyncStorage.removeItem('routines');
          await AsyncStorage.setItem('routines-reset-deneme-v1', 'true');
          // Explicitly set to default routines after reset
          setRoutines(defaultRoutines);
          setIsLoaded(true);
          return;
        }

        const storedRoutines = await AsyncStorage.getItem('routines');
        if (storedRoutines) {
          const parsed = JSON.parse(storedRoutines);
          // Only use stored routines if they exist
          if (parsed.length > 0) {
            setRoutines(parsed);
          } else {
            // If stored but empty, use defaults
            setRoutines(defaultRoutines);
          }
        } else {
          // No stored routines, use defaults
          setRoutines(defaultRoutines);
        }
      } catch (error) {
        console.error('Error loading routines:', error);
        // On error, fall back to defaults
        setRoutines(defaultRoutines);
      } finally {
        setIsLoaded(true);
      }
    };
    loadRoutines();
  }, []);

  // Save routines to AsyncStorage whenever they change
  useEffect(() => {
    if (isLoaded) {
      const saveRoutines = async () => {
        try {
          await AsyncStorage.setItem('routines', JSON.stringify(routines));
        } catch (error) {
          console.error('Error saving routines:', error);
        }
      };
      saveRoutines();
    }
  }, [routines, isLoaded]);

  const addRoutine = useCallback((routineInput) => {
    if (!routineInput) {
      return;
    }

    const {
      name = 'Custom Routine',
      description = '',
      rounds = 1,
      workSec = 60,
      restSec = 30,
      spotifyPlaylist = null,
      targetDurationMin = null,
      workoutPlaylistId = null,
      restPlaylistId = null,
      shuffleMode = false,
      shuffleWorkMode = false,
      shuffleRestMode = false,
      restVolume = 100,
      restVolumeEnabled = false,
      voiceCountdownEnabled = false,
      countdownAtStart = true,
      countdownStartMode = 'preroll',
      countdownAfterWork = false,
      countdownAfterRest = false,
      countdownDuration = 3,
      // New countdown settings
      countdownBeforeStart = false,
      countdownBeforeStartDuration = 0,
      countdownBeforeStartSound = null,
      countdownStartWork = false,
      countdownStartWorkDuration = 0,
      countdownStartWorkSound = null,
      countdownEndWork = false,
      countdownEndWorkDuration = 0,
      countdownEndWorkSound = null,
      countdownEndRest = false,
      countdownEndRestDuration = 0,
      countdownEndRestSound = null,
      roundsData = null,
      platform = null,
      completionNotificationEnabled = false,
      completionNotificationType = 'text',
      completionNotificationText = '',
      completionNotificationSound = null,
    } = routineInput;

    const normalizedName = name.trim() || 'Custom Routine';
    const slug = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const id = `${slug || 'routine'}-${Date.now()}`;

    const routineToStore = {
      id,
      name: normalizedName,
      description,
      rounds,
      workSec,
      restSec,
      spotifyPlaylist,
      targetDurationMin,
      workoutPlaylistId,
      restPlaylistId,
      shuffleMode,
      shuffleWorkMode,
      shuffleRestMode,
      restVolume,
      restVolumeEnabled,
      voiceCountdownEnabled,
      countdownAtStart,
      countdownStartMode,
      countdownAfterWork,
      countdownAfterRest,
      countdownDuration,
      // New countdown settings
      countdownBeforeStart,
      countdownBeforeStartDuration,
      countdownBeforeStartSound,
      countdownStartWork,
      countdownStartWorkDuration,
      countdownStartWorkSound,
      countdownEndWork,
      countdownEndWorkDuration,
      countdownEndWorkSound,
      countdownEndRest,
      countdownEndRestDuration,
      countdownEndRestSound,
      roundsData,
      platform,
      completionNotificationEnabled,
      completionNotificationType,
      completionNotificationText,
      completionNotificationSound,
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
    ],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
};

export const useRoutineContext = () => useContext(RoutineContext);


