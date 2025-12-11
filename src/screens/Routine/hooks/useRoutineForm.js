import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Alert } from 'react-native';

/**
 * Custom hook for managing routine form state and handlers
 * Extracts all state management logic from CreateRoutineScreen
 * 
 * @param {Object} params
 * @param {Object|null} params.templateRoutine - Existing routine to edit (or null for new)
 * @param {Function} params.addRoutine - Context function to add new routine
 * @param {Function} params.updateRoutine - Context function to update existing routine
 * @param {Function} params.onSave - Callback after successful save
 */
export const useRoutineForm = ({ 
  templateRoutine, 
  addRoutine, 
  updateRoutine, 
  onSave 
}) => {
  const playlistStateRef = useRef({ work: {}, rest: {} });
  const templateRoutineIdRef = useRef(templateRoutine?.id);

  // Initialize values from template
  const initialValues = useMemo(() => {
    if (!templateRoutine) {
      return {
        name: '',
        numberOfRounds: '1',
        roundsOrder: [1],
        workSec: '60',
        restSec: '30',
        totalDurationMin: '',
        roundWorkSecs: {},
        roundRestSecs: {},
        roundWorkSongs: {},
        roundRestSongs: {},
        roundWorkPlaylists: {},
        roundRestPlaylists: {},
      };
    }
    
    const workSongs = {};
    const restSongs = {};
    const workSecs = {};
    const restSecs = {};
    const workPlaylists = {};
    const restPlaylists = {};
    
    if (templateRoutine.roundsData && Array.isArray(templateRoutine.roundsData)) {
      templateRoutine.roundsData.forEach((round) => {
        const roundNum = round.roundNumber;
        
        // Work music: Song has priority over playlist
        if (round.workSong) {
          workSongs[roundNum] = round.workSong;
        } else if (round.workPlaylistId) {
          workPlaylists[roundNum] = {
            id: round.workPlaylistId,
            name: round.workPlaylistName || 'Playlist',
            image: round.workPlaylistImage || null,
            tracksCount: round.workPlaylistTracksCount || 0,
            platform: round.workPlaylistPlatform || null,
          };
        }
        
        // Rest music: Song has priority over playlist
        if (round.restSong) {
          restSongs[roundNum] = round.restSong;
        } else if (round.restPlaylistId) {
          restPlaylists[roundNum] = {
            id: round.restPlaylistId,
            name: round.restPlaylistName || 'Playlist',
            image: round.restPlaylistImage || null,
            tracksCount: round.restPlaylistTracksCount || 0,
            platform: round.restPlaylistPlatform || null,
          };
        }
        
        if (round.workSec !== undefined) workSecs[roundNum] = String(round.workSec);
        if (round.restSec !== undefined) restSecs[roundNum] = String(round.restSec);
      });
    }
    
    const numRounds = templateRoutine.rounds || 1;
    const roundsOrder = Array.from({ length: numRounds }, (_, i) => i + 1);
    
    // If templateRoutine has an ID, it means we're editing an existing routine
    const isEditing = !!templateRoutine.id;
    const routineName = templateRoutine.name 
      ? (isEditing ? templateRoutine.name : `${templateRoutine.name} (Copy)`)
      : '';
    
    return {
      name: routineName,
      numberOfRounds: String(numRounds),
      roundsOrder,
      workSec: String(templateRoutine.workSec || 60),
      restSec: String(templateRoutine.restSec || 30),
      totalDurationMin: templateRoutine.targetDurationMin ? String(templateRoutine.targetDurationMin) : '',
      roundWorkSecs: workSecs,
      roundRestSecs: restSecs,
      roundWorkSongs: workSongs,
      roundRestSongs: restSongs,
      roundWorkPlaylists: workPlaylists,
      roundRestPlaylists: restPlaylists,
    };
  }, [templateRoutine]);

  // Core routine state
  const [name, setName] = useState(initialValues.name);
  const [numberOfRounds, setNumberOfRounds] = useState(initialValues.numberOfRounds);
  const [roundsOrder, setRoundsOrder] = useState(initialValues.roundsOrder);
  const [workSec, setWorkSec] = useState(initialValues.workSec);
  const [restSec, setRestSec] = useState(initialValues.restSec);
  const [totalDurationMin, setTotalDurationMin] = useState(initialValues.totalDurationMin);
  
  // Per-round state
  const [roundWorkSecs, setRoundWorkSecs] = useState(initialValues.roundWorkSecs);
  const [roundRestSecs, setRoundRestSecs] = useState(initialValues.roundRestSecs);
  const [roundWorkSongs, setRoundWorkSongs] = useState(initialValues.roundWorkSongs);
  const [roundRestSongs, setRoundRestSongs] = useState(initialValues.roundRestSongs);
  const [roundWorkPlaylists, setRoundWorkPlaylists] = useState(initialValues.roundWorkPlaylists);
  const [roundRestPlaylists, setRoundRestPlaylists] = useState(initialValues.roundRestPlaylists);
  
  // Playlist IDs for shuffle
  const [workoutPlaylistId, setWorkoutPlaylistId] = useState(null);
  const [restPlaylistId, setRestPlaylistId] = useState(null);
  
  // Advanced Settings State
  const [restVolume, setRestVolume] = useState(templateRoutine?.restVolume ?? 100);
  // Before Start countdown - has duration
  const [countdownBeforeStartSec, setCountdownBeforeStartSec] = useState(templateRoutine?.countdownBeforeStartDuration ?? 0);
  const [countdownBeforeStartSound, setCountdownBeforeStartSound] = useState(templateRoutine?.countdownBeforeStartSound ?? null);
  // Phase transition sounds - just sound, no duration (sound plays at transition, overlays music)
  const [endWorkSound, setEndWorkSound] = useState(templateRoutine?.endWorkSound ?? null);
  const [endRestSound, setEndRestSound] = useState(templateRoutine?.endRestSound ?? null);

  // Track playlist state changes
  useEffect(() => {
    playlistStateRef.current.work = roundWorkPlaylists;
  }, [roundWorkPlaylists]);
  
  useEffect(() => {
    playlistStateRef.current.rest = roundRestPlaylists;
  }, [roundRestPlaylists]);
  
  // Update from template when template ID changes
  useEffect(() => {
    if (templateRoutine?.id && templateRoutineIdRef.current !== templateRoutine.id) {
      templateRoutineIdRef.current = templateRoutine.id;
      if (Object.keys(playlistStateRef.current.work).length === 0) {
        setRoundWorkPlaylists(initialValues.roundWorkPlaylists);
      }
      if (Object.keys(playlistStateRef.current.rest).length === 0) {
        setRoundRestPlaylists(initialValues.roundRestPlaylists);
      }
    }
  }, [templateRoutine?.id, initialValues.roundWorkPlaylists, initialValues.roundRestPlaylists]);

  // Handlers
  const attachSongToRound = useCallback((roundNum, song, type) => {
    const songWithPlatform = {
      ...song,
      platform: song.platform || song.source || 'device'
    };
    
    if (type === 'work') {
      setRoundWorkSongs(prev => ({ ...prev, [roundNum]: songWithPlatform }));
      setRoundWorkPlaylists(prev => {
        const newState = { ...prev };
        delete newState[roundNum];
        return newState;
      });
    } else {
      setRoundRestSongs(prev => ({ ...prev, [roundNum]: songWithPlatform }));
      setRoundRestPlaylists(prev => {
        const newState = { ...prev };
        delete newState[roundNum];
        return newState;
      });
    }
  }, []);
  
  const attachPlaylistToRound = useCallback((roundNum, playlist, type) => {
    const playlistData = {
      id: playlist.id,
      name: playlist.name,
      image: playlist.image || null,
      tracksCount: playlist.tracksCount || 0,
      platform: playlist.platform || 'device'
    };

    if (type === 'work') {
      setRoundWorkPlaylists(prev => ({ ...prev, [roundNum]: playlistData }));
      setRoundWorkSongs(prev => {
        const newState = { ...prev };
        delete newState[roundNum];
        return newState;
      });
    } else {
      setRoundRestPlaylists(prev => ({ ...prev, [roundNum]: playlistData }));
      setRoundRestSongs(prev => {
        const newState = { ...prev };
        delete newState[roundNum];
        return newState;
      });
    }
  }, []);

  const handleAddRound = useCallback(() => {
    const newRoundNum = roundsOrder.length + 1;
    setRoundsOrder(prev => [...prev, newRoundNum]);
    setNumberOfRounds(String(newRoundNum));
  }, [roundsOrder.length]);

  const handleClearAll = useCallback(() => {
    setRoundWorkSecs({});
    setRoundRestSecs({});
    setRoundWorkSongs({});
    setRoundRestSongs({});
    setRoundWorkPlaylists({});
    setRoundRestPlaylists({});
  }, []);

  const handleShuffleForWork = useCallback((playlist, roundSongs) => {
    if (!roundSongs) return;
    setRoundWorkSongs(prev => ({ ...prev, ...roundSongs }));
    setWorkoutPlaylistId(playlist.id);
  }, []);

  const handleShuffleForRest = useCallback((playlist, roundSongs) => {
    if (!roundSongs) return;
    setRoundRestSongs(prev => ({ ...prev, ...roundSongs }));
    setRestPlaylistId(playlist.id);
  }, []);

  const handleRemoveRound = useCallback((roundNum) => {
    if (roundsOrder.length <= 1) {
      Alert.alert('Cannot Remove', 'You must have at least one round.');
      return;
    }
    
    const remainingRounds = roundsOrder.filter(r => r !== roundNum);
    const newOrder = remainingRounds.map((_, index) => index + 1);
    setRoundsOrder(newOrder);
    setNumberOfRounds(String(newOrder.length));
    
    // Build mapping from old to new round numbers
    const oldToNewMap = {};
    remainingRounds.forEach((oldNum, index) => {
      oldToNewMap[oldNum] = index + 1;
    });
    
    // Rebuild all state objects with new sequential keys
    const rebuildState = (prev) => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum] !== undefined) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    };
    
    setRoundWorkSecs(rebuildState);
    setRoundRestSecs(rebuildState);
    setRoundWorkSongs(rebuildState);
    setRoundRestSongs(rebuildState);
    setRoundWorkPlaylists(rebuildState);
    setRoundRestPlaylists(rebuildState);
  }, [roundsOrder]);

  const handleRemoveWorkMusic = useCallback((roundNum) => {
    setRoundWorkSongs(prev => {
      const newState = { ...prev };
      delete newState[roundNum];
      return newState;
    });
    setRoundWorkPlaylists(prev => {
      const newState = { ...prev };
      delete newState[roundNum];
      return newState;
    });
  }, []);

  const handleRemoveRestMusic = useCallback((roundNum) => {
    setRoundRestSongs(prev => {
      const newState = { ...prev };
      delete newState[roundNum];
      return newState;
    });
    setRoundRestPlaylists(prev => {
      const newState = { ...prev };
      delete newState[roundNum];
      return newState;
    });
  }, []);

  const handleSaveRoutine = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a routine name');
      return;
    }
    
    const rounds = parseInt(numberOfRounds, 10);
    if (isNaN(rounds) || rounds < 1) {
      Alert.alert('Error', 'Please add at least one round');
      return;
    }
    
    const roundsData = roundsOrder.slice(0, rounds).map(roundNum => ({
      roundNumber: roundNum,
      workSec: roundWorkSecs[roundNum] ? parseInt(roundWorkSecs[roundNum]) : parseInt(workSec),
      restSec: roundRestSecs[roundNum] ? parseInt(roundRestSecs[roundNum]) : parseInt(restSec),
      workSong: roundWorkSongs[roundNum] || null,
      restSong: roundRestSongs[roundNum] || null,
      workPlaylistId: roundWorkPlaylists[roundNum]?.id || null,
      workPlaylistName: roundWorkPlaylists[roundNum]?.name || null,
      workPlaylistImage: (roundWorkPlaylists[roundNum]?.image && roundWorkPlaylists[roundNum].image.trim() !== '') ? roundWorkPlaylists[roundNum].image : null,
      workPlaylistTracksCount: roundWorkPlaylists[roundNum]?.tracksCount || 0,
      workPlaylistPlatform: roundWorkPlaylists[roundNum]?.platform || null,
      restPlaylistId: roundRestPlaylists[roundNum]?.id || null,
      restPlaylistName: roundRestPlaylists[roundNum]?.name || null,
      restPlaylistImage: (roundRestPlaylists[roundNum]?.image && roundRestPlaylists[roundNum].image.trim() !== '') ? roundRestPlaylists[roundNum].image : null,
      restPlaylistTracksCount: roundRestPlaylists[roundNum]?.tracksCount || 0,
      restPlaylistPlatform: roundRestPlaylists[roundNum]?.platform || null,
    }));
    
    const routineData = {
      name,
      rounds,
      workSec: parseInt(workSec),
      restSec: parseInt(restSec),
      targetDurationMin: totalDurationMin ? parseInt(totalDurationMin) : null,
      workoutPlaylistId: workoutPlaylistId || null,
      restPlaylistId: restPlaylistId || null,
      restVolume: restVolume,
      restVolumeEnabled: restVolume < 100,
      // Before Start countdown - has duration
      countdownBeforeStart: countdownBeforeStartSec > 0,
      countdownBeforeStartDuration: countdownBeforeStartSec,
      countdownBeforeStartSound: countdownBeforeStartSound,
      // Phase transition sounds - just sound, plays at transition and overlays music
      endWorkSound: endWorkSound,
      endRestSound: endRestSound,
      roundsData
    };
    
    // Debug: Log what we're saving
    console.log('💾 Saving routine:', name);
    console.log('💾 Advanced settings:', {
      restVolume,
      countdownBeforeStartSec,
      countdownBeforeStartSound,
      endWorkSound: endWorkSound?.name,
      endRestSound: endRestSound?.name,
    });
    
    if (templateRoutine?.id) {
      console.log('💾 Updating existing routine:', templateRoutine.id);
      updateRoutine({
        ...routineData,
        id: templateRoutine.id,
      });
    } else {
      console.log('💾 Adding new routine');
      addRoutine(routineData);
    }
    
    if (onSave) onSave();
  }, [
    name, numberOfRounds, roundsOrder, workSec, restSec, totalDurationMin,
    roundWorkSecs, roundRestSecs, roundWorkSongs, roundRestSongs,
    roundWorkPlaylists, roundRestPlaylists, workoutPlaylistId, restPlaylistId,
    restVolume, countdownBeforeStartSec, countdownBeforeStartSound,
    endWorkSound, endRestSound,
    templateRoutine?.id, addRoutine, updateRoutine, onSave
  ]);

  return {
    // Core state
    name, setName,
    numberOfRounds, setNumberOfRounds,
    roundsOrder, setRoundsOrder,
    workSec, setWorkSec,
    restSec, setRestSec,
    totalDurationMin, setTotalDurationMin,
    
    // Per-round state
    roundWorkSecs, setRoundWorkSecs,
    roundRestSecs, setRoundRestSecs,
    roundWorkSongs, setRoundWorkSongs,
    roundRestSongs, setRoundRestSongs,
    roundWorkPlaylists, setRoundWorkPlaylists,
    roundRestPlaylists, setRoundRestPlaylists,
    
    // Advanced settings
    restVolume, setRestVolume,
    countdownBeforeStartSec, setCountdownBeforeStartSec,
    countdownBeforeStartSound, setCountdownBeforeStartSound,
    // Phase transition sounds
    endWorkSound, setEndWorkSound,
    endRestSound, setEndRestSound,
    
    // Handlers
    attachSongToRound,
    attachPlaylistToRound,
    handleAddRound,
    handleClearAll,
    handleShuffleForWork,
    handleShuffleForRest,
    handleRemoveRound,
    handleRemoveWorkMusic,
    handleRemoveRestMusic,
    handleSaveRoutine,
  };
};

