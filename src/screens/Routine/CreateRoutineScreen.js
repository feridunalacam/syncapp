import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import FormFieldError from '../../components/common/FormFieldError';
import { MusicSearchModal } from './components/MusicSearchModal';
import { RoundEditor } from './components/RoundEditor';
import { RoundConfiguration } from './components/RoundConfiguration';
import { PlaylistCard } from './components/PlaylistCard';
import { AdvancedSettings } from './components/AdvancedSettings';
import { useRoutineForm } from './hooks/useRoutineForm';

export default function CreateRoutineScreen({ navigation, route }) {
  const { addRoutine, updateRoutine } = useRoutineContext();
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  
  const templateRoutine = route?.params?.templateRoutine || null;
  
  // Use custom hook for all form state and handlers
  const form = useRoutineForm({
    templateRoutine,
    addRoutine,
    updateRoutine,
    onSave: () => navigation.goBack(),
  });
  
  // Check if any advanced settings were modified (for auto-expanding)
  const hasAdvancedSettingsModified = 
    form.restVolume !== 100 ||
    form.countdownBeforeStartSec > 0 ||
    form.countdownBeforeStartSound !== null ||
    form.endWorkSound !== null ||
    form.endRestSound !== null;

  // UI State (local to this screen)
  const [selectedRoundForSong, setSelectedRoundForSong] = useState(null);
  const [songType, setSongType] = useState('work');
  const [showSongPicker, setShowSongPicker] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(hasAdvancedSettingsModified);
  const [showSoundPicker, setShowSoundPicker] = useState(null);
  
  // Song picker handlers
  const handleOpenSongPicker = (roundNum, type) => {
    setSelectedRoundForSong(roundNum);
    setSongType(type);
    setShowSongPicker(true);
  };

  const handleAttachSong = (roundNum, song, type) => {
    form.attachSongToRound(roundNum, song, type);
    setShowSongPicker(false);
  };
  
  const handleAttachPlaylist = (roundNum, playlist, type) => {
    form.attachPlaylistToRound(roundNum, playlist, type);
    setShowSongPicker(false);
  };

  // Sound picker handler for countdown sounds
  const handleSoundSelected = (roundNum, song) => {
    if (showSoundPicker === 'beforeStart') form.setCountdownBeforeStartSound(song);
    else if (showSoundPicker === 'endWork') form.setEndWorkSound(song);
    else if (showSoundPicker === 'endRest') form.setEndRestSound(song);
    setShowSoundPicker(null);
  };
    
  // Remove sound handler
  const handleSoundRemove = (soundType) => {
    if (soundType === 'endWork') form.setEndWorkSound(null);
    else if (soundType === 'endRest') form.setEndRestSound(null);
  };

  // Before Start duration change - clear sound when 0
  const handleBeforeStartSecChange = (value) => {
    form.setCountdownBeforeStartSec(value);
    if (value === 0) {
      form.setCountdownBeforeStartSound(null);
    }
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
          style={{ paddingRight: theme.spacing.md }}
        >
          <Ionicons name="chevron-back" size={28} color={theme.accent} />
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
          value={form.name}
          onChangeText={form.setName}
          accessibilityLabel="Routine name"
          accessibilityHint="Enter a name for this routine"
          maxLength={60}
        />
        <TouchableOpacity
          onPress={form.handleSaveRoutine}
          style={screenStyles.addButton}
          accessibilityRole="button"
          accessibilityLabel={templateRoutine?.id ? 'Update routine' : 'Save routine'}
        >
          <Text style={screenStyles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      {form.nameError ? (
        <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs }}>
          <FormFieldError message={form.nameError} />
        </View>
      ) : null}
      
      <ScrollView 
        style={screenStyles.scrollView}
        contentContainerStyle={screenStyles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={screenStyles.formSection}>
        {/* Round Configuration */}
        <RoundConfiguration
            workSec={form.workSec}
            restSec={form.restSec}
            onWorkSecChange={form.setWorkSec}
            onRestSecChange={form.setRestSec}
            onAddRound={form.handleAddRound}
            numberOfRounds={form.roundsOrder.length}
            onRoundsChange={(val) => {
              // Update rounds order based on new count
              const currentLength = form.roundsOrder.length;
              if (val > currentLength) {
                const newRounds = Array.from({ length: val - currentLength }, (_, i) => currentLength + i + 1);
                form.setRoundsOrder([...form.roundsOrder, ...newRounds]);
              } else if (val < currentLength) {
                form.setRoundsOrder(form.roundsOrder.slice(0, val));
              }
              form.setNumberOfRounds(String(val));
            }}
          />

          {/* Playlist & Rounds Combined Card */}
          <View style={screenStyles.card}>
            {/* Playlist Section (embedded) */}
        <PlaylistCard 
              roundsOrder={form.roundsOrder}
              onShuffleForWork={form.handleShuffleForWork}
              onShuffleForRest={form.handleShuffleForRest}
              embedded={true}
        />

            {/* Rounds Header - reduced top margin */}
            <View style={[screenStyles.cardSectionHeaderWithBorder, { marginTop: -theme.spacing.sm }]}>
              <Text style={screenStyles.cardSectionTitle}>
              Rounds
                        </Text>
              <TouchableOpacity
                onPress={form.handleClearAll}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
              }}
              activeOpacity={0.6}
            >
                <Ionicons name="trash-outline" size={14} color={theme.textSecondary} />
                <Text style={{ 
                  fontSize: theme.fontSize.sm, 
                  fontWeight: theme.fontWeight.medium, 
                  color: theme.textSecondary 
                }}>
                  Clear
                </Text>
                </TouchableOpacity>
              </View>

            {/* Rounds Content */}
            {form.roundsOrder.length === 0 ? (
                    <View style={{ 
                padding: theme.spacing.xl,
              alignItems: 'center',
            }}>
                <Text style={{ 
                  fontSize: theme.fontSize.base, 
                  color: theme.textTertiary, 
                  marginBottom: theme.spacing.sm 
                }}>
                No rounds yet
                        </Text>
                <TouchableOpacity onPress={form.handleAddRound}>
                  <Text style={{ 
                    fontSize: theme.fontSize.sm, 
                    color: theme.accent, 
                    fontWeight: theme.fontWeight.medium 
                  }}>
                  Add your first round
                              </Text>
                            </TouchableOpacity>
                            </View>
          ) : (
              <View>
                {form.roundsOrder.map((roundNum, index) => (
                <RoundEditor
                  key={roundNum}
                  roundNum={roundNum}
                    workSec={form.roundWorkSecs[roundNum] !== undefined ? form.roundWorkSecs[roundNum] : form.workSec}
                    restSec={form.roundRestSecs[roundNum] !== undefined ? form.roundRestSecs[roundNum] : form.restSec}
                    onWorkSecChange={(val) => form.setRoundWorkSecs(prev => ({ ...prev, [roundNum]: val }))}
                    onRestSecChange={(val) => form.setRoundRestSecs(prev => ({ ...prev, [roundNum]: val }))}
                    workSong={form.roundWorkSongs[roundNum]}
                    restSong={form.roundRestSongs[roundNum]}
                    workPlaylist={form.roundWorkPlaylists[roundNum]}
                    restPlaylist={form.roundRestPlaylists[roundNum]}
                    onWorkMusicPress={() => handleOpenSongPicker(roundNum, 'work')}
                    onRestMusicPress={() => handleOpenSongPicker(roundNum, 'rest')}
                    onRemoveWorkMusic={() => form.handleRemoveWorkMusic(roundNum)}
                    onRemoveRestMusic={() => form.handleRemoveRestMusic(roundNum)}
                    onRemoveRound={() => form.handleRemoveRound(roundNum)}
                    isLast={index === form.roundsOrder.length - 1}
                />
              ))}
              
                {/* Add Round Button */}
              <TouchableOpacity
                  onPress={form.handleAddRound}
                style={{
                    padding: theme.spacing.lg,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={24} color={theme.iconTertiary} />
              </TouchableOpacity>
            </View>
          )}
          </View>

          {/* Advanced Settings */}
          <AdvancedSettings
            isExpanded={showAdvancedSettings}
            onToggle={() => setShowAdvancedSettings(!showAdvancedSettings)}
            restVolume={form.restVolume}
            onRestVolumeChange={form.setRestVolume}
            // Before Start - duration picker
            countdownBeforeStartSec={form.countdownBeforeStartSec}
            onCountdownBeforeStartSecChange={handleBeforeStartSecChange}
            countdownBeforeStartSound={form.countdownBeforeStartSound}
            // End Work & End Rest sounds
            endWorkSound={form.endWorkSound}
            endRestSound={form.endRestSound}
            onSoundPickerOpen={setShowSoundPicker}
            onSoundRemove={handleSoundRemove}
          />
          
          {/* Sound Picker Modal - For countdown sounds */}
          <MusicSearchModal 
            visible={showSoundPicker !== null}
            onClose={() => setShowSoundPicker(null)}
            attachSongToRound={handleSoundSelected}
            attachPlaylistToRound={() => setShowSoundPicker(null)}
            selectedRoundForSong={1}
            songType="work"
            roundWorkSongs={{}}
            roundRestSongs={{}}
            roundWorkPlaylists={{}}
            roundRestPlaylists={{}}
            isForCountdownSound={true}
          />
        </View>
      </ScrollView>

      {/* Music Search Modal - For round music */}
      <MusicSearchModal 
        visible={showSongPicker}
        onClose={() => setShowSongPicker(false)}
        attachSongToRound={handleAttachSong}
        attachPlaylistToRound={handleAttachPlaylist}
        selectedRoundForSong={selectedRoundForSong}
        songType={songType}
        roundWorkSongs={form.roundWorkSongs}
        roundRestSongs={form.roundRestSongs}
        roundWorkPlaylists={form.roundWorkPlaylists}
        roundRestPlaylists={form.roundRestPlaylists}
      />
    </ScreenWrapper>
  );
}
