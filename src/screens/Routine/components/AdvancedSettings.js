import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Switch } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import Surface from '../../../components/common/Surface';
import { useTheme } from '../../../context/ThemeContext';
import { normalizeAlertConfig, createAlertPreset } from '../../../domain/alerts';
import { SPOTIFY_AVAILABLE } from '../../../services/spotify/config';
import appleMusicService from '../../../services/appleMusic';
import DurationField from './DurationField';
import AlertSoundPicker from './AlertSoundPicker';

const PRESETS = [
  { id: 'hiit', name: 'Voice', icon: 'mic-outline' },
  { id: 'boxing', name: 'Boxing', icon: 'notifications-outline' },
  { id: 'beeps', name: 'Beeps', icon: 'pulse-outline' },
  { id: 'silent', name: 'Silent', icon: 'volume-mute-outline' },
];
const SIGNALS = [
  { id: 'start', title: 'Start workout' },
  { id: 'rest', title: 'Start rest' },
  { id: 'work', title: 'Next work interval' },
  { id: 'finish', title: 'Workout complete' },
];
const TARGETS = [
  { id: 'preparation', name: 'Before start' },
  { id: 'work', name: 'Before rest' },
  { id: 'rest', name: 'Before work' },
];

function Segments({ label, options, value, onChange }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={[styles.segments, { backgroundColor: theme.cardSecondary }]}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${option.label}`}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: theme.accentLight }]}
          >
            <Text
              style={{
                color: selected ? theme.accent : theme.textSecondary,
                fontSize: 12,
                fontWeight: selected ? '600' : '500',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const AdvancedSettings = ({
  isExpanded,
  onToggle,
  restVolume,
  onRestVolumeChange,
  preparationVolume = 50,
  onPreparationVolumeChange,
  workVolume = 100,
  onWorkVolumeChange,
  countdownBeforeStartSec,
  onCountdownBeforeStartSecChange,
  countdownBeforeStartSound,
  endWorkSound,
  endRestSound,
  onSoundPickerOpen,
  onSoundRemove,
  audioAlerts,
  onAudioAlertsChange,
  onPreviewCue,
  onStopPreview,
  previewing,
}) => {
  const { theme } = useTheme();
  const [selectedSignal, setSelectedSignal] = useState(null);
  const legacy = audioAlerts == null;
  const config = normalizeAlertConfig(audioAlerts) || createAlertPreset('hiit');
  const enabled = !legacy && config.enabled;
  const legacySounds = [
    { id: 'beforeStart', title: 'Preparation alert', sound: countdownBeforeStartSound },
    { id: 'endWork', title: 'End of work', sound: endWorkSound },
    { id: 'endRest', title: 'End of rest', sound: endRestSound },
  ];
  const update = (next) => {
    onStopPreview?.();
    onAudioAlertsChange?.(normalizeAlertConfig(next));
  };
  const ensurePreparation = () => {
    if (Number(countdownBeforeStartSec) === 0) onCountdownBeforeStartSecChange(3);
  };
  const choosePreset = (id) => {
    const preset = createAlertPreset(id);
    if (preset.enabled) ensurePreparation();
    update(preset);
  };
  const updateCountdown = (patch) =>
    update({ ...config, countdown: { ...config.countdown, ...patch } });
  const closePicker = () => {
    onStopPreview?.();
    setSelectedSignal(null);
  };
  const presetMatches = (id) => {
    if (legacy) return false;
    const preset = createAlertPreset(id);
    if (!preset.enabled) return !config.enabled;
    return (
      config.enabled &&
      config.countdown.mode === preset.countdown.mode &&
      config.countdown.seconds === preset.countdown.seconds &&
      TARGETS.every(({ id: key }) => config.countdown[key] === preset.countdown[key]) &&
      SIGNALS.every(({ id: key }) => config.signals[key]?.uri === preset.signals[key]?.uri)
    );
  };
  const signal = SIGNALS.find((item) => item.id === selectedSignal);
  const title = (text) => (
    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{text}</Text>
  );
  const label = (text) => <Text style={[styles.label, { color: theme.text }]}>{text}</Text>;
  const volume = (name, value, onChange) => (
    <View style={styles.volume}>
      <View style={styles.between}>
        {label(name)}
        <Text style={[styles.value, { color: theme.textSecondary }]}>{value}%</Text>
      </View>
      <Slider
        accessibilityLabel={name}
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={5}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={theme.accent}
        maximumTrackTintColor={theme.border}
        thumbTintColor={theme.accent}
      />
    </View>
  );
  const previewLabel =
    config.countdown.mode === 'off'
      ? 'Preview the chosen cue.'
      : 'Preview the last 3 seconds + the chosen cue.';

  return (
    <>
      <Surface variant="card" style={styles.card}>
        <Pressable
          onPress={() => {
            if (isExpanded) onStopPreview?.();
            onToggle();
          }}
          style={styles.header}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Ionicons name="options-outline" size={18} color={theme.textSecondary} />
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
              Audio & alerts
            </Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={17}
            color={theme.textSecondary}
          />
        </Pressable>
        {isExpanded && (
          <View style={styles.body}>
            <View style={[styles.row, { borderColor: theme.border }]}>
              {label('Preparation')}
              <DurationField
                compact
                label="Preparation time"
                value={countdownBeforeStartSec}
                onChange={(value) => onCountdownBeforeStartSecChange(Number(value))}
              />
            </View>
            {countdownBeforeStartSec > 0 && (
              <>
                {volume('Preparation music volume', preparationVolume, onPreparationVolumeChange)}
                <Text style={[styles.note, { color: theme.textSecondary }]}>
                  Your first Work track starts during preparation and continues into Work.
                </Text>
              </>
            )}
            {volume('Work music volume', workVolume, onWorkVolumeChange)}
            {volume('Rest music volume', restVolume, onRestVolumeChange)}
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              Voice cues and alert sounds play with Device audio.
              {appleMusicService.available &&
                ' Apple Music intervals use the visual timer and device volume.'}
              {SPOTIFY_AVAILABLE && ' Spotify intervals use the visual timer.'}
            </Text>
            <View style={[styles.section, { borderColor: theme.border }]}>
              {title('Workout cues')}
              <View style={styles.presets}>
                {PRESETS.map((preset) => {
                  const selected = presetMatches(preset.id);
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => choosePreset(preset.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${preset.name} cue preset`}
                      accessibilityState={{ selected }}
                      style={[
                        styles.preset,
                        { backgroundColor: selected ? theme.accentLight : theme.cardSecondary },
                      ]}
                    >
                      <Ionicons
                        name={preset.icon}
                        size={18}
                        color={selected ? theme.accent : theme.textSecondary}
                      />
                      <Text
                        style={{
                          color: selected ? theme.accent : theme.textSecondary,
                          fontSize: 11,
                          fontWeight: '600',
                        }}
                      >
                        {preset.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                {label('Audio coaching')}
                <Text style={[styles.detail, { color: theme.textSecondary }]}>
                  Countdowns and interval cues
                </Text>
              </View>
              <Switch
                accessibilityLabel="Audio coaching"
                value={enabled}
                trackColor={{ true: theme.accent }}
                onValueChange={(value) => {
                  if (value && legacy) ensurePreparation();
                  update({ ...(legacy ? createAlertPreset('hiit') : config), enabled: value });
                }}
              />
            </View>
            {legacy && (
              <View>
                {title('Existing alerts')}
                {legacySounds.map(({ id, title: text, sound }) => (
                  <View key={id} style={[styles.soundRow, { borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => {
                        onStopPreview?.();
                        onSoundPickerOpen(id);
                      }}
                      style={styles.soundChoice}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${text.toLowerCase()}`}
                    >
                      <View style={{ flex: 1 }}>
                        {label(text)}
                        <Text
                          numberOfLines={1}
                          style={[styles.detail, { color: theme.textSecondary }]}
                        >
                          {sound?.name || 'None'}
                        </Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        onStopPreview?.();
                        sound ? onSoundRemove(id) : onSoundPickerOpen(id);
                      }}
                      style={styles.iconButton}
                      accessibilityRole="button"
                      accessibilityLabel={
                        sound ? `Remove ${text.toLowerCase()}` : `Add ${text.toLowerCase()}`
                      }
                    >
                      <Ionicons
                        name={sound ? 'close' : 'add'}
                        size={18}
                        color={sound ? theme.textSecondary : theme.accent}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {enabled && (
              <>
                <View style={[styles.section, { borderColor: theme.border }]}>
                  {title('Countdown')}
                  <Segments
                    label="Countdown mode"
                    value={config.countdown.mode}
                    onChange={(mode) => updateCountdown({ mode })}
                    options={[
                      { value: 'voice', label: 'Voice' },
                      { value: 'beep', label: 'Beep' },
                      { value: 'off', label: 'Off' },
                    ]}
                  />
                  {config.countdown.mode !== 'off' && (
                    <>
                      <View style={styles.settingRow}>
                        {label('Length')}
                        <View style={styles.inlineSegments}>
                          <Segments
                            label="Countdown length"
                            value={config.countdown.seconds}
                            onChange={(seconds) => updateCountdown({ seconds })}
                            options={[3, 5, 10].map((seconds) => ({
                              value: seconds,
                              label: `${seconds}s`,
                            }))}
                          />
                        </View>
                      </View>
                      <View style={styles.targets}>
                        {TARGETS.map(({ id, name }) => (
                          <Pressable
                            key={id}
                            onPress={() => updateCountdown({ [id]: !config.countdown[id] })}
                            accessibilityRole="checkbox"
                            accessibilityLabel={`${name} countdown`}
                            accessibilityState={{ checked: config.countdown[id] }}
                            style={styles.target}
                          >
                            <Ionicons
                              name={config.countdown[id] ? 'checkmark-circle' : 'ellipse-outline'}
                              size={18}
                              color={config.countdown[id] ? theme.accent : theme.textTertiary}
                            />
                            <Text
                              numberOfLines={2}
                              style={{
                                flex: 1,
                                color: theme.textSecondary,
                                fontSize: 10,
                                lineHeight: 13,
                              }}
                            >
                              {name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[styles.note, { color: theme.textSecondary }]}>
                        Counts the final {config.countdown.seconds}s of each selected phase. Short
                        intervals use the time available.
                      </Text>
                    </>
                  )}
                  {(config.countdown.mode === 'voice' ||
                    SIGNALS.some(({ id }) => config.signals[id]?.uri?.startsWith('speech://'))) && (
                    <View style={styles.settingRow}>
                      <View>
                        {label('Voice language')}
                        <Text style={[styles.detail, { color: theme.textSecondary }]}>
                          {config.language === 'en-US' ? 'SyncApp Coach' : 'Device voice'}
                        </Text>
                      </View>
                      <View style={styles.inlineSegments}>
                        <Segments
                          label="Voice language"
                          value={config.language}
                          onChange={(language) => update({ ...config, language })}
                          options={[
                            { value: 'en-US', label: 'EN' },
                            { value: 'tr-TR', label: 'TR' },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </View>
                <View style={{ paddingTop: 14 }}>{title('Transition sounds')}</View>
                {SIGNALS.map(({ id, title: text }) => (
                  <View key={id} style={[styles.soundRow, { borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => {
                        onStopPreview?.();
                        setSelectedSignal(id);
                      }}
                      style={styles.soundChoice}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${text.toLowerCase()} sound`}
                    >
                      <View style={{ flex: 1 }}>
                        {label(text)}
                        <Text
                          numberOfLines={1}
                          style={[styles.detail, { color: theme.textSecondary }]}
                        >
                          {config.signals[id]?.name || 'None'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={13} color={theme.textTertiary} />
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        previewing === id ? onStopPreview?.() : onPreviewCue?.(id, config)
                      }
                      disabled={!onPreviewCue}
                      style={[
                        styles.iconButton,
                        {
                          backgroundColor: previewing === id ? theme.accentLight : 'transparent',
                          opacity: onPreviewCue ? 1 : 0.4,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={
                        previewing === id
                          ? `Stop ${text.toLowerCase()} preview`
                          : `Preview ${text.toLowerCase()} countdown and cue`
                      }
                    >
                      <Ionicons
                        name={previewing === id ? 'stop' : 'play-outline'}
                        size={19}
                        color={theme.accent}
                      />
                    </Pressable>
                  </View>
                ))}
                <Text style={[styles.previewHint, { color: theme.textSecondary }]}>
                  {previewLabel}
                </Text>
                {volume('Effects volume', config.volume, (next) =>
                  update({ ...config, volume: next }),
                )}
                <Text style={[styles.note, { color: theme.textSecondary }]}>
                  Spoken cues use your device’s media volume. Alerts play on this device.
                </Text>
              </>
            )}
          </View>
        )}
      </Surface>
      <AlertSoundPicker
        visible={Boolean(signal)}
        title={signal?.title || 'Choose sound'}
        selected={signal ? config.signals[signal.id] : null}
        onClose={closePicker}
        onSelect={(sound) => {
          if (signal) update({ ...config, signals: { ...config.signals, [signal.id]: sound } });
          closePicker();
        }}
        onCustom={() => {
          const id = signal?.id;
          closePicker();
          if (id) onSoundPickerOpen(`cue:${id}`);
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 21, marginTop: 6, marginBottom: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  body: { paddingHorizontal: 16, paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '500' },
  value: { fontSize: 12, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  volume: { paddingTop: 12, paddingBottom: 4 },
  slider: { height: 38, marginTop: 3 },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  sectionLabel: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  presets: { flexDirection: 'row', gap: 6 },
  preset: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  segments: { flexDirection: 'row', padding: 3, borderRadius: 13 },
  segment: {
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 9,
  },
  inlineSegments: { width: 170, flexShrink: 1 },
  targets: { flexDirection: 'row', gap: 6, marginTop: 5 },
  target: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  soundChoice: {
    flex: 1,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHint: { fontSize: 10, lineHeight: 15, marginTop: 8 },
  note: { fontSize: 11, lineHeight: 17, paddingBottom: 4 },
});
