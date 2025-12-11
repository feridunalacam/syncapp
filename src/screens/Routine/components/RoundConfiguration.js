import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTheme } from '../../../context/ThemeContext';
import { createScreenStyles } from '../../../styles/screenStyles';

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Generate time options (every 5 seconds, up to 30 min)
const generateTimeOptions = () => {
  const options = [];
  for (let m = 0; m <= 30; m++) {
    for (let s = 0; s < 60; s += 5) {
      if (m === 0 && s === 0) continue;
      options.push(m * 60 + s);
    }
  }
  return options;
};
const TIME_OPTIONS = generateTimeOptions();
const ROUND_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

/**
 * Time Picker Modal
 */
const TimePickerModal = ({ visible, onClose, title, value, onChange, theme }) => {
  const mins = Math.floor(value / 60);
  const secs = value % 60;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity 
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: theme.spacing.md,
            paddingBottom: Platform.OS === 'ios' ? 40 : theme.spacing.xl,
          }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: theme.spacing.xl,
              paddingBottom: theme.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: 16, color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{title}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.accent }}>Done</Text>
              </TouchableOpacity>
            </View>
            {/* Pickers */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 180, paddingHorizontal: theme.spacing.xl }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: theme.textTertiary, marginBottom: 4 }}>MIN</Text>
                <Picker
                  selectedValue={mins}
                  onValueChange={(v) => onChange(v * 60 + secs)}
                  style={{ width: '100%', height: 150 }}
                  itemStyle={{ color: theme.text, fontSize: 22, fontWeight: '500' }}
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <Picker.Item key={i} label={String(i)} value={i} />
                  ))}
                </Picker>
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: theme.text, marginTop: 16 }}>:</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: theme.textTertiary, marginBottom: 4 }}>SEC</Text>
                <Picker
                  selectedValue={secs}
                  onValueChange={(v) => onChange(mins * 60 + v)}
                  style={{ width: '100%', height: 150 }}
                  itemStyle={{ color: theme.text, fontSize: 22, fontWeight: '500' }}
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <Picker.Item key={i} label={String(i).padStart(2, '0')} value={i} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

/**
 * Round Picker Modal
 */
const RoundPickerModal = ({ visible, onClose, value, onChange, theme }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <TouchableOpacity 
      style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
        <View style={{
          backgroundColor: theme.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: theme.spacing.md,
          paddingBottom: Platform.OS === 'ios' ? 40 : theme.spacing.xl,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.xl,
            paddingBottom: theme.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 16, color: theme.textSecondary }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>Rounds</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.accent }}>Done</Text>
            </TouchableOpacity>
          </View>
          {/* Picker */}
          <View style={{ alignItems: 'center', height: 180 }}>
            <Picker
              selectedValue={value}
              onValueChange={onChange}
              style={{ width: 120 }}
              itemStyle={{ color: theme.text, fontSize: 24, fontWeight: '500' }}
            >
              {ROUND_OPTIONS.map((r) => (
                <Picker.Item key={r} label={String(r)} value={r} />
              ))}
            </Picker>
          </View>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

/**
 * Inline picker - shows multiple options so user knows they can scroll
 */
const InlinePicker = ({ label, value, options, onChange, onTap, formatLabel, theme }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    {/* Label */}
    <TouchableOpacity onPress={onTap} activeOpacity={0.7}>
      <Text style={{ 
        fontSize: 11, 
        color: theme.textSecondary,
        fontWeight: '500',
      }}>
        {label}
      </Text>
    </TouchableOpacity>
    
    {/* Picker - shows selected + next option */}
    <Picker
      selectedValue={value}
      onValueChange={onChange}
      style={{ 
        width: '100%', 
        height: 120,
        marginTop: -20,
        marginBottom: -20,
      }}
      itemStyle={{ 
        color: theme.text,
        fontSize: 18,
        fontWeight: '600',
        height: 120,
      }}
    >
      {options.map((opt) => (
        <Picker.Item 
          key={opt} 
          label={formatLabel ? formatLabel(opt) : String(opt)} 
          value={opt} 
        />
      ))}
    </Picker>
  </View>
);

export const RoundConfiguration = ({
  workSec,
  restSec,
  onWorkSecChange,
  onRestSecChange,
  onAddRound,
  numberOfRounds = 1,
  onRoundsChange,
}) => {
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const [showWorkPicker, setShowWorkPicker] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);
  
  const workTotal = parseInt(workSec || 60);
  const restTotal = parseInt(restSec || 30);
  const rounds = parseInt(numberOfRounds || 1);
  const totalSeconds = rounds * (workTotal + restTotal);

  return (
    <View style={screenStyles.card}>
      {/* Header */}
      <View style={screenStyles.cardSectionHeaderWithBorder}>
        <Text style={screenStyles.cardSectionTitle}>
          Round Configuration
        </Text>
        <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary }}>
          Total: <Text style={{ fontWeight: '600', color: theme.text }}>{formatTime(totalSeconds)}</Text>
        </Text>
      </View>

      {/* 3 Inline Pickers - Clean layout */}
      <View style={{ 
        flexDirection: 'row', 
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}>
        <InlinePicker
          label="ROUND"
          value={rounds}
          options={ROUND_OPTIONS}
          onChange={(val) => onRoundsChange && onRoundsChange(val)}
          onTap={() => setShowRoundPicker(true)}
          theme={theme}
        />
        
        {/* Divider */}
        <View style={{ width: 1, backgroundColor: theme.border, marginVertical: theme.spacing.md }} />
        
        <InlinePicker
          label="WORK"
          value={workTotal}
          options={TIME_OPTIONS}
          onChange={(val) => onWorkSecChange(String(val))}
          onTap={() => setShowWorkPicker(true)}
          formatLabel={formatTime}
          theme={theme}
        />
        
        {/* Divider */}
        <View style={{ width: 1, backgroundColor: theme.border, marginVertical: theme.spacing.md }} />
        
        <InlinePicker
          label="REST"
          value={restTotal}
          options={TIME_OPTIONS}
          onChange={(val) => onRestSecChange(String(val))}
          onTap={() => setShowRestPicker(true)}
          formatLabel={formatTime}
          theme={theme}
        />
      </View>

      {/* Modals */}
      <RoundPickerModal
        visible={showRoundPicker}
        onClose={() => setShowRoundPicker(false)}
        value={rounds}
        onChange={(val) => {
          if (onRoundsChange) onRoundsChange(val);
        }}
        theme={theme}
      />
      <TimePickerModal
        visible={showWorkPicker}
        onClose={() => setShowWorkPicker(false)}
        title="Work Time"
        value={workTotal}
        onChange={(val) => onWorkSecChange(String(val))}
        theme={theme}
      />
      <TimePickerModal
        visible={showRestPicker}
        onClose={() => setShowRestPicker(false)}
        title="Rest Time"
        value={restTotal}
        onChange={(val) => onRestSecChange(String(val))}
        theme={theme}
      />
    </View>
  );
};
