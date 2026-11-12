import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import GlassSurface from '../../components/common/GlassSurface';
import FormFieldError from '../../components/common/FormFieldError';
import { MusicSearchModal } from './components/MusicSearchModal';
import { RoundEditor } from './components/RoundEditor';
import { RoundConfiguration } from './components/RoundConfiguration';
import { PlaylistCard } from './components/PlaylistCard';
import { AdvancedSettings } from './components/AdvancedSettings';
import { getRoutineDuration } from '../../domain/routines';
import { normalizeAlertConfig } from '../../domain/alerts';
import useAlertPreview from '../../hooks/useAlertPreview';
import useSpotifyConnection from '../Profile/hooks/useSpotifyConnection';
import { useRoutineForm } from './hooks/useRoutineForm';

export default function CreateRoutineScreen({ navigation, route }) {
  const { addRoutine, updateRoutine } = useRoutineContext();
  const { theme } = useTheme();
  const spotify = useSpotifyConnection();
  const { previewCue, stopPreview, previewing } = useAlertPreview();

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
    form.audioAlerts != null ||
    form.preparationVolume !== 50 ||
    form.workVolume !== 100 ||
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
  const editorRoutineId = useRef(templateRoutine?.id);

  useEffect(() => {
    if (editorRoutineId.current === templateRoutine?.id) return;
    editorRoutineId.current = templateRoutine?.id;
    stopPreview();
    setShowSoundPicker(null);
    setShowSongPicker(false);
    setShowAdvancedSettings(
      templateRoutine?.audioAlerts != null ||
        (templateRoutine?.preparationVolume ?? 50) !== 50 ||
        (templateRoutine?.workVolume ?? 100) !== 100 ||
        (templateRoutine?.restVolume ?? 100) !== 100 ||
        (templateRoutine?.countdownBeforeStartDuration ?? 0) > 0 ||
        templateRoutine?.countdownBeforeStartSound != null ||
        templateRoutine?.endWorkSound != null ||
        templateRoutine?.endRestSound != null,
    );
  }, [templateRoutine, stopPreview]);

  const handleAudioAlertsChange = (config) => {
    stopPreview();
    form.setAudioAlerts(config == null ? null : normalizeAlertConfig(config));
  };

  const handleOpenSoundPicker = (soundType) => {
    stopPreview();
    setShowSoundPicker(soundType);
  };

  const handleToggleAdvancedSettings = () => {
    stopPreview();
    setShowAdvancedSettings((expanded) => !expanded);
  };

  const handleSave = () => {
    stopPreview();
    form.handleSaveRoutine();
  };

  // Song picker handlers
  const handleOpenSongPicker = (roundNum, type) => {
    stopPreview();
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
    stopPreview();
    if (showSoundPicker?.startsWith('cue:')) {
      const key = showSoundPicker.slice(4);
      if (['start', 'rest', 'work', 'finish'].includes(key)) {
        const config = normalizeAlertConfig(form.audioAlerts);
        form.setAudioAlerts(
          normalizeAlertConfig({ ...config, signals: { ...config.signals, [key]: song } }),
        );
      }
    } else if (showSoundPicker === 'beforeStart') form.setCountdownBeforeStartSound(song);
    else if (showSoundPicker === 'endWork') form.setEndWorkSound(song);
    else if (showSoundPicker === 'endRest') form.setEndRestSound(song);
    setShowSoundPicker(null);
  };

  // Remove sound handler
  const handleSoundRemove = (soundType) => {
    stopPreview();
    if (soundType === 'beforeStart') form.setCountdownBeforeStartSound(null);
    else if (soundType === 'endWork') form.setEndWorkSound(null);
    else if (soundType === 'endRest') form.setEndRestSound(null);
  };

  // Before Start duration change - clear sound when 0
  const handleBeforeStartSecChange = (value) => {
    stopPreview();
    form.setCountdownBeforeStartSec(value);
    if (value === 0) {
      form.setCountdownBeforeStartSound(null);
    }
  };

  return (
    <ScreenWrapper style={styles.fill}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to routines"
        >
          <GlassSurface
            interactive
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={23} color={theme.accent} />
          </GlassSurface>
        </Pressable>
        <TextInput
          style={{
            flex: 1,
            fontSize: 19,
            fontWeight: '600',
            color: theme.text,
            paddingVertical: 10,
          }}
          placeholder="Routine name"
          placeholderTextColor={theme.textTertiary}
          value={form.name}
          onChangeText={form.setName}
          accessibilityLabel="Routine name"
          maxLength={60}
        />
        <Pressable
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={templateRoutine?.id ? 'Update routine' : 'Save routine'}
        >
          <GlassSurface
            interactive
            style={{
              paddingHorizontal: 18,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.accent }}>Save</Text>
          </GlassSurface>
        </Pressable>
      </View>
      {form.nameError ? (
        <View style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs }}>
          <FormFieldError message={form.nameError} />
        </View>
      ) : null}

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          {/* Round Configuration */}
          <RoundConfiguration
            totalDurationSec={getRoutineDuration({
              rounds: form.roundsOrder.length,
              workSec: Number(form.workSec),
              restSec: Number(form.restSec),
              countdownBeforeStartDuration: form.countdownBeforeStartSec,
              roundsData: form.roundsOrder.map((n) => ({
                workSec: Number(form.roundWorkSecs[n] ?? form.workSec),
                restSec: Number(form.roundRestSecs[n] ?? form.restSec),
              })),
            })}
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
                const newRounds = Array.from(
                  { length: val - currentLength },
                  (_, i) => currentLength + i + 1,
                );
                form.setRoundsOrder([...form.roundsOrder, ...newRounds]);
              } else if (val < currentLength) {
                form.setRoundsOrder(form.roundsOrder.slice(0, val));
              }
              form.setNumberOfRounds(String(val));
            }}
          />

          {spotify.available && (
            <PlaylistCard
              roundsOrder={form.roundsOrder}
              onShuffleForWork={form.handleShuffleForWork}
              onShuffleForRest={form.handleShuffleForRest}
              onConnect={spotify.connect}
              connecting={spotify.connecting}
            />
          )}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '600', color: theme.text }}>Intervals</Text>
            <Pressable onPress={form.handleClearAll} hitSlop={12}>
              <Text style={{ fontSize: 12, color: theme.textSecondary }}>Reset intervals</Text>
            </Pressable>
          </View>
          <View>
            {/* Rounds Content */}
            {form.roundsOrder.length === 0 ? (
              <View
                style={{
                  padding: theme.spacing.xl,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize.base,
                    color: theme.textTertiary,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  No rounds yet
                </Text>
                <TouchableOpacity onPress={form.handleAddRound}>
                  <Text
                    style={{
                      fontSize: theme.fontSize.sm,
                      color: theme.accent,
                      fontWeight: theme.fontWeight.medium,
                    }}
                  >
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
                    workSec={
                      form.roundWorkSecs[roundNum] !== undefined
                        ? form.roundWorkSecs[roundNum]
                        : form.workSec
                    }
                    restSec={
                      form.roundRestSecs[roundNum] !== undefined
                        ? form.roundRestSecs[roundNum]
                        : form.restSec
                    }
                    onWorkSecChange={(val) =>
                      form.setRoundWorkSecs((prev) => ({ ...prev, [roundNum]: val }))
                    }
                    onRestSecChange={(val) =>
                      form.setRoundRestSecs((prev) => ({ ...prev, [roundNum]: val }))
                    }
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
                    canRemove={form.roundsOrder.length > 1}
                  />
                ))}

                <Pressable
                  onPress={form.handleAddRound}
                  disabled={form.roundsOrder.length >= 50}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    padding: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Ionicons name="add" size={19} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
                    Add round
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Advanced Settings */}
          <AdvancedSettings
            isExpanded={showAdvancedSettings}
            onToggle={handleToggleAdvancedSettings}
            audioAlerts={form.audioAlerts}
            onAudioAlertsChange={handleAudioAlertsChange}
            onPreviewCue={previewCue}
            onStopPreview={stopPreview}
            previewing={previewing}
            preparationVolume={form.preparationVolume}
            onPreparationVolumeChange={form.setPreparationVolume}
            workVolume={form.workVolume}
            onWorkVolumeChange={form.setWorkVolume}
            restVolume={form.restVolume}
            onRestVolumeChange={form.setRestVolume}
            // Before Start - duration picker
            countdownBeforeStartSec={form.countdownBeforeStartSec}
            onCountdownBeforeStartSecChange={handleBeforeStartSecChange}
            countdownBeforeStartSound={form.countdownBeforeStartSound}
            // End Work & End Rest sounds
            endWorkSound={form.endWorkSound}
            endRestSound={form.endRestSound}
            onSoundPickerOpen={handleOpenSoundPicker}
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

const styles = StyleSheet.create({ fill: { flex: 1 } });
