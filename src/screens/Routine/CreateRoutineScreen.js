import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import { MusicSearchModal } from './components/MusicSearchModal';
import { RoundEditor } from './components/RoundEditor';
import { RoundConfiguration } from './components/RoundConfiguration';
import { PlaylistCard } from './components/PlaylistCard';

export default function CreateRoutineScreen({ navigation, route }) {
  const { addRoutine, updateRoutine } = useRoutineContext();
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  
  const templateRoutine = route?.params?.templateRoutine || null;
  const playlistStateRef = useRef({ work: {}, rest: {} });
  const templateRoutineIdRef = useRef(templateRoutine?.id);
  
  const initializeFromTemplate = useMemo(() => {
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
    // Don't add "(Copy)" suffix in that case
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
  }, [templateRoutine?.id]); // Only recalculate if templateRoutine ID changes
  
  const initialValues = initializeFromTemplate;
  
  const [name, setName] = useState(initialValues.name);
  const [numberOfRounds, setNumberOfRounds] = useState(initialValues.numberOfRounds);
  const [roundsOrder, setRoundsOrder] = useState(initialValues.roundsOrder);
  const [workSec, setWorkSec] = useState(initialValues.workSec);
  const [restSec, setRestSec] = useState(initialValues.restSec);
  const [totalDurationMin, setTotalDurationMin] = useState(initialValues.totalDurationMin);
  const [roundWorkSecs, setRoundWorkSecs] = useState(initialValues.roundWorkSecs);
  const [roundRestSecs, setRoundRestSecs] = useState(initialValues.roundRestSecs);
  const [roundWorkSongs, setRoundWorkSongs] = useState(initialValues.roundWorkSongs);
  const [roundRestSongs, setRoundRestSongs] = useState(initialValues.roundRestSongs);
  // Initialize state - use ref to preserve across remounts
  const [roundWorkPlaylists, setRoundWorkPlaylists] = useState(() => {
    // If template ID changed or ref is empty, initialize from template
    if (templateRoutineIdRef.current !== templateRoutine?.id || 
        Object.keys(playlistStateRef.current.work).length === 0) {
      templateRoutineIdRef.current = templateRoutine?.id;
      const playlists = initialValues.roundWorkPlaylists;
      playlistStateRef.current.work = playlists;
      return playlists;
    }
    // Otherwise preserve from ref
    return playlistStateRef.current.work;
  });
  
  const [roundRestPlaylists, setRoundRestPlaylists] = useState(() => {
    // If template ID changed or ref is empty, initialize from template
    if (templateRoutineIdRef.current !== templateRoutine?.id || 
        Object.keys(playlistStateRef.current.rest).length === 0) {
      const playlists = initialValues.roundRestPlaylists;
      playlistStateRef.current.rest = playlists;
      return playlists;
    }
    // Otherwise preserve from ref
    return playlistStateRef.current.rest;
  });
  
  // Sync state to ref whenever it changes (so it persists across remounts)
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
      // Only update if we don't have existing state
      if (Object.keys(playlistStateRef.current.work).length === 0) {
        setRoundWorkPlaylists(initialValues.roundWorkPlaylists);
      }
      if (Object.keys(playlistStateRef.current.rest).length === 0) {
        setRoundRestPlaylists(initialValues.roundRestPlaylists);
      }
    }
  }, [templateRoutine?.id, initialValues.roundWorkPlaylists, initialValues.roundRestPlaylists]);
  
  // UI State
  const [selectedRoundForSong, setSelectedRoundForSong] = useState(null);
  const [songType, setSongType] = useState('work');
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [workoutPlaylistId, setWorkoutPlaylistId] = useState(null);
  const [restPlaylistId, setRestPlaylistId] = useState(null);
  
  // Helper: Get default search platform
  const attachSongToRound = (roundNum, song, type) => {
    // Each song carries its own platform info from MusicSearchModal
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
    setShowSongPicker(false);
  };
  
  const attachPlaylistToRound = (roundNum, playlist, type) => {
    // Playlist carries its own platform info from MusicSearchModal
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
    setShowSongPicker(false);
  };

  const handleAddRound = () => {
    const newRoundNum = roundsOrder.length + 1;
    setRoundsOrder([...roundsOrder, newRoundNum]);
    setNumberOfRounds(String(newRoundNum));
  };

  const handleClearAll = () => {
    // Clear all round-specific times
    setRoundWorkSecs({});
    setRoundRestSecs({});
    
    // Clear all songs
    setRoundWorkSongs({});
    setRoundRestSongs({});
    
    // Clear all playlists
    setRoundWorkPlaylists({});
    setRoundRestPlaylists({});
  };

  // Handle shuffle for work - receives playlist and roundSongs from PlaylistCard
  const handleShuffleForWork = (playlist, roundSongs) => {
    if (!roundSongs) return;
    
    // Update all work songs for all rounds
    setRoundWorkSongs(prev => ({ ...prev, ...roundSongs }));
    setWorkoutPlaylistId(playlist.id);
  };

  // Handle shuffle for rest - receives playlist and roundSongs from PlaylistCard
  const handleShuffleForRest = (playlist, roundSongs) => {
    if (!roundSongs) return;
    
    // Update all rest songs for all rounds
    setRoundRestSongs(prev => ({ ...prev, ...roundSongs }));
    setRestPlaylistId(playlist.id);
  };

  const handleRemoveRound = (roundNum) => {
    if (roundsOrder.length <= 1) {
      Alert.alert('Cannot Remove', 'You must have at least one round.');
      return;
    }
    
    // Filter out the deleted round
    const remainingRounds = roundsOrder.filter(r => r !== roundNum);
    
    // Renumber rounds sequentially starting from 1
    const newOrder = remainingRounds.map((_, index) => index + 1);
    setRoundsOrder(newOrder);
    setNumberOfRounds(String(newOrder.length));
    
    // Rebuild all state objects with new sequential keys
    const oldToNewMap = {};
    remainingRounds.forEach((oldNum, index) => {
      oldToNewMap[oldNum] = index + 1;
    });
    
    // Rebuild roundWorkSecs
    setRoundWorkSecs(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum] !== undefined) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
    
    // Rebuild roundRestSecs
    setRoundRestSecs(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum] !== undefined) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
    
    // Rebuild roundWorkSongs
      setRoundWorkSongs(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum]) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
    
    // Rebuild roundRestSongs
      setRoundRestSongs(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum]) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
    
    // Rebuild roundWorkPlaylists
      setRoundWorkPlaylists(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum]) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
    
    // Rebuild roundRestPlaylists
    setRoundRestPlaylists(prev => {
      const newState = {};
      remainingRounds.forEach(oldNum => {
        if (prev[oldNum]) {
          newState[oldToNewMap[oldNum]] = prev[oldNum];
        }
      });
      return newState;
    });
  };
  
  const handleSaveRoutine = () => {
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
      shuffleMode: workoutPlaylistId ? true : false, // Enable shuffle if workout playlist is set
      roundsData
    };
    
    // If templateRoutine has an ID, update existing routine instead of creating new one
    if (templateRoutine?.id) {
      updateRoutine({
        ...routineData,
        id: templateRoutine.id,
      });
    } else {
      addRoutine(routineData);
    }
    
    navigation.goBack();
  };

  return (
    <ScreenWrapper style={screenStyles.container}>
      {/* Header */}
            <View style={{ 
                  flexDirection: 'row',
                  alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.card,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.borderDark,
            ...theme.shadow.md,
          }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <TextInput
          style={{
            flex: 1,
            fontSize: theme.fontSize.lg,
            fontWeight: theme.fontWeight.semibold,
            color: theme.text,
            textAlign: 'center',
            paddingHorizontal: theme.spacing.sm,
          }}
          placeholder="Routine Name"
          placeholderTextColor={theme.inputPlaceholder}
          value={name}
          onChangeText={setName}
        />
                  <TouchableOpacity
          onPress={handleSaveRoutine}
                    style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.card,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.borderDark,
            ...theme.shadow.md,
          }}
        >
          <Ionicons name="checkmark" size={20} color={theme.text} />
                      </TouchableOpacity>
                  </View>
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing['2xl'], paddingBottom: theme.spacing['4xl'] }}
        showsVerticalScrollIndicator={false}
      >
        {/* Round Configuration */}
        <RoundConfiguration
          numberOfRounds={numberOfRounds}
          setNumberOfRounds={setNumberOfRounds}
          roundsOrder={roundsOrder}
          setRoundsOrder={setRoundsOrder}
          workSec={workSec}
          setWorkSec={setWorkSec}
          restSec={restSec}
          setRestSec={setRestSec}
          totalDurationMin={totalDurationMin}
          setTotalDurationMin={setTotalDurationMin}
        />

        {/* Your Playlists Section */}
        <PlaylistCard 
          roundsOrder={roundsOrder}
          onShuffleForWork={handleShuffleForWork}
          onShuffleForRest={handleShuffleForRest}
        />

        {/* Rounds List */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <Text style={{ fontSize: 15, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
              Rounds
                        </Text>
              <TouchableOpacity
              onPress={handleClearAll}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                backgroundColor: theme.card,
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
              <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.textSecondary }}>Clear</Text>
                </TouchableOpacity>
              </View>

          {roundsOrder.length === 0 ? (
                    <View style={{ 
              padding: theme.spacing['2xl'],
              alignItems: 'center',
              borderWidth: 1,
              borderColor: theme.border,
              borderStyle: 'dashed',
              borderRadius: 8,
            }}>
              <Text style={{ fontSize: theme.fontSize.base, color: theme.textTertiary, marginBottom: theme.spacing.sm }}>
                No rounds yet
                        </Text>
              <TouchableOpacity onPress={handleAddRound}>
                <Text style={{ fontSize: theme.fontSize.sm, color: theme.text, fontWeight: theme.fontWeight.medium }}>
                  Add your first round
                              </Text>
                            </TouchableOpacity>
                            </View>
          ) : (
            <View style={{
              backgroundColor: theme.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.borderLight,
              overflow: 'hidden',
            }}>
              {roundsOrder.map((roundNum, index) => (
                <RoundEditor
                  key={roundNum}
                  roundNum={roundNum}
                  workSec={roundWorkSecs[roundNum] !== undefined ? roundWorkSecs[roundNum] : workSec}
                  restSec={roundRestSecs[roundNum] !== undefined ? roundRestSecs[roundNum] : restSec}
                  onWorkSecChange={(val) => setRoundWorkSecs(prev => ({ ...prev, [roundNum]: val }))}
                  onRestSecChange={(val) => setRoundRestSecs(prev => ({ ...prev, [roundNum]: val }))}
                  workSong={roundWorkSongs[roundNum]}
                  restSong={roundRestSongs[roundNum]}
                  workPlaylist={roundWorkPlaylists[roundNum]}
                  restPlaylist={roundRestPlaylists[roundNum]}
                  onWorkMusicPress={() => {
                    setSelectedRoundForSong(roundNum);
                    setSongType('work');
                    setShowSongPicker(true);
                  }}
                  onRestMusicPress={() => {
                    setSelectedRoundForSong(roundNum);
                    setSongType('rest');
                    setShowSongPicker(true);
                  }}
                  onRemoveWorkMusic={() => {
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
                  }}
                  onRemoveRestMusic={() => {
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
                  }}
                  onRemoveRound={handleRemoveRound}
                  isLast={index === roundsOrder.length - 1}
                />
              ))}
              
              {/* Add Round Button - Minimal design */}
              <TouchableOpacity
                onPress={handleAddRound}
                style={{
                  padding: theme.spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.card,
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={24} color={theme.iconTertiary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      <MusicSearchModal 
        visible={showSongPicker}
        onClose={() => setShowSongPicker(false)}
        attachSongToRound={attachSongToRound}
        attachPlaylistToRound={attachPlaylistToRound}
        selectedRoundForSong={selectedRoundForSong}
        songType={songType}
        roundWorkSongs={roundWorkSongs}
        roundRestSongs={roundRestSongs}
        roundWorkPlaylists={roundWorkPlaylists}
        roundRestPlaylists={roundRestPlaylists}
      />
    </ScreenWrapper>
  );
}
