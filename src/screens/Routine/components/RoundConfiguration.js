import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';

// Helper function to filter out non-numeric characters
const filterNumeric = (text) => {
  return text.replace(/[^0-9]/g, '');
};

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Parse MM:SS or M:SS format to seconds
const parseTime = (timeString) => {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  if (parts.length !== 2) return 0;
  const mins = parseInt(parts[0]) || 0;
  const secs = parseInt(parts[1]) || 0;
  return mins * 60 + secs;
};

export const RoundConfiguration = ({
  numberOfRounds,
  setNumberOfRounds,
  roundsOrder,
  setRoundsOrder,
  workSec,
  setWorkSec,
  restSec,
  setRestSec,
  totalDurationMin,
  setTotalDurationMin,
}) => {
  const { theme } = useTheme();
  const [showWorkPicker, setShowWorkPicker] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);
  
  const workMins = Math.floor(parseInt(workSec || 0) / 60);
  const workSecs = parseInt(workSec || 0) % 60;
  const restMins = Math.floor(parseInt(restSec || 0) / 60);
  const restSecs = parseInt(restSec || 0) % 60;
  
  // Calculate total duration automatically
  const rounds = parseInt(numberOfRounds) || 0;
  const work = parseInt(workSec) || 0;
  const rest = parseInt(restSec) || 0;
  const totalSeconds = rounds * (work + rest);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalSecondsRemainder = totalSeconds % 60;
  const totalDurationDisplay = totalSeconds > 0 
    ? `${totalMinutes}:${totalSecondsRemainder.toString().padStart(2, '0')}`
    : '0:00';
  
  const handleRoundsChange = (delta) => {
    const current = parseInt(numberOfRounds) || 0;
    const newValue = Math.max(1, current + delta);
    setNumberOfRounds(String(newValue));
    
    const currentLength = roundsOrder.length;
    if (newValue > currentLength) {
      const newRounds = Array.from({ length: newValue - currentLength }, (_, i) => currentLength + i + 1);
      setRoundsOrder([...roundsOrder, ...newRounds]);
    } else if (newValue < currentLength) {
      setRoundsOrder(roundsOrder.slice(0, newValue));
    }
  };
  
  const handleTimeInput = (value, setter, currentValue) => {
    // Allow typing MM:SS format
    const cleaned = value.replace(/[^0-9:]/g, '');
    
    // If user types just numbers, format as MM:SS
    if (!cleaned.includes(':')) {
      const numeric = filterNumeric(cleaned);
      if (numeric.length <= 2) {
        // Just seconds
        setter(String(Math.min(59, parseInt(numeric) || 0)));
      } else if (numeric.length <= 4) {
        // MMSS format, convert to seconds
        const mins = parseInt(numeric.slice(0, -2)) || 0;
        const secs = parseInt(numeric.slice(-2)) || 0;
        setter(String(mins * 60 + Math.min(59, secs)));
      }
    } else {
      // MM:SS format
      const parsed = parseTime(cleaned);
      setter(String(parsed));
    }
  };
  
  return (
    <View style={{
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      marginBottom: theme.spacing['2xl'],
      backgroundColor: theme.card,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        minHeight: 45,
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
          Round Configuration
        </Text>
      </View>
      
      {/* Content */}
      <View style={{ padding: theme.spacing.lg }}>
        {/* Group 1: Round */}
      <View style={{ marginBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <TouchableOpacity
            onPress={() => handleRoundsChange(-1)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.cardSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            disabled={parseInt(numberOfRounds) <= 1}
          >
            <Ionicons 
              name="remove" 
              size={20} 
              color={parseInt(numberOfRounds) <= 1 ? theme.textTertiary : theme.text} 
            />
          </TouchableOpacity>
          
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ 
              fontSize: theme.fontSize['3xl'], 
              fontWeight: theme.fontWeight.bold, 
              color: theme.text 
            }}>
              {numberOfRounds || '1'}
            </Text>
            <Text style={{ 
              fontSize: theme.fontSize.xs, 
              color: theme.textSecondary,
              marginTop: 2,
            }}>
              {parseInt(numberOfRounds) === 1 ? 'Round' : 'Rounds'}
            </Text>
          </View>
          
          <TouchableOpacity
            onPress={() => handleRoundsChange(1)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.cardSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={20} color={theme.text} />
          </TouchableOpacity>
        </View>
        </View>

      {/* Group 2: Work & Rest & Total Duration (Side by Side) */}
      <View style={{ marginBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {/* Work Time */}
        <View style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: theme.fontSize.sm, 
              fontWeight: theme.fontWeight.medium, 
              color: theme.textSecondary, 
              marginBottom: theme.spacing.xs,
            }}>
            Work
          </Text>
            <TouchableOpacity
              onPress={() => setShowWorkPicker(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                backgroundColor: theme.inputBackground,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{
                fontSize: theme.fontSize.xl,
                fontWeight: theme.fontWeight.semibold,
                color: theme.inputText,
                textAlign: 'center',
              }}>
                {formatTime(parseInt(workSec || 0))}
              </Text>
            </TouchableOpacity>
            
            {/* Work Time Picker Modal */}
            <Modal
              visible={showWorkPicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowWorkPicker(false)}
            >
              <TouchableOpacity 
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                }}
                activeOpacity={1}
                onPress={() => setShowWorkPicker(false)}
              >
                <TouchableOpacity 
                  activeOpacity={1}
                  onPress={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: theme.card,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    paddingTop: theme.spacing.lg,
                    paddingBottom: Platform.OS === 'ios' ? 50 : theme.spacing.xl,
                    ...theme.shadow.lg,
                  }}
                >
                  {/* Header */}
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.xl,
                    paddingBottom: theme.spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}>
                    <TouchableOpacity 
                      onPress={() => setShowWorkPicker(false)}
                      style={{
                        paddingVertical: theme.spacing.xs,
                        paddingHorizontal: theme.spacing.sm,
                      }}
                    >
                      <Text style={{ 
                        fontSize: theme.fontSize.base, 
                        color: theme.textSecondary,
                        fontWeight: theme.fontWeight.medium,
                      }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ 
                        fontSize: theme.fontSize.sm, 
                        fontWeight: theme.fontWeight.semibold, 
                        color: theme.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Work Time
                      </Text>
                      <Text style={{ 
                        fontSize: theme.fontSize['2xl'], 
                        fontWeight: theme.fontWeight.bold, 
                        color: theme.text,
                        marginTop: 4,
                      }}>
                        {formatTime(workMins * 60 + workSecs)}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setShowWorkPicker(false)}
                      style={{
                        paddingVertical: theme.spacing.xs,
                        paddingHorizontal: theme.spacing.sm,
                        backgroundColor: theme.text,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ 
                        fontSize: theme.fontSize.base, 
                        fontWeight: theme.fontWeight.semibold, 
                        color: theme.background,
                      }}>
                        Done
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Picker Container */}
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.xl,
                    paddingTop: theme.spacing.lg,
                    height: 220,
                  }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ 
                        fontSize: theme.fontSize.xs, 
                        color: theme.textTertiary, 
                        marginBottom: theme.spacing.xs,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: theme.fontWeight.medium,
                      }}>
                        Minutes
                      </Text>
                      <Picker
                        selectedValue={workMins}
                        onValueChange={(itemValue) => {
                          setWorkSec(String(itemValue * 60 + workSecs));
                        }}
                        style={{ 
                          flex: 1, 
                          width: '100%',
                        }}
                        itemStyle={{ 
                          color: theme.text,
                          fontSize: theme.fontSize['2xl'],
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={String(i)} value={i} />
                        ))}
                      </Picker>
                    </View>
                    
                    {/* Separator */}
                    <View style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.md,
                      paddingTop: 40,
                    }}>
                      <Text style={{
                        fontSize: theme.fontSize['3xl'],
                        fontWeight: theme.fontWeight.bold,
                        color: theme.text,
                      }}>
                        :
                      </Text>
                    </View>
                    
                    <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ 
              fontSize: theme.fontSize.xs,
              color: theme.textTertiary, 
                        marginBottom: theme.spacing.xs,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
              fontWeight: theme.fontWeight.medium,
            }}>
                        Seconds
            </Text>
                      <Picker
                        selectedValue={workSecs}
                        onValueChange={(itemValue) => {
                          setWorkSec(String(workMins * 60 + itemValue));
                        }}
                        style={{ 
                          flex: 1, 
                          width: '100%',
                        }}
                        itemStyle={{ 
                          color: theme.text,
                          fontSize: theme.fontSize['2xl'],
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={String(i).padStart(2, '0')} value={i} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
        </View>

          {/* Rest Time */}
        <View style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: theme.fontSize.sm, 
              fontWeight: theme.fontWeight.medium, 
              color: theme.textSecondary, 
              marginBottom: theme.spacing.xs,
            }}>
            Rest
          </Text>
            <TouchableOpacity
              onPress={() => setShowRestPicker(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                backgroundColor: theme.inputBackground,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{
                fontSize: theme.fontSize.xl,
                fontWeight: theme.fontWeight.semibold,
                color: theme.inputText,
                textAlign: 'center',
              }}>
                {formatTime(parseInt(restSec || 0))}
              </Text>
            </TouchableOpacity>
            
            {/* Rest Time Picker Modal */}
            <Modal
              visible={showRestPicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowRestPicker(false)}
            >
              <TouchableOpacity 
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                }}
                activeOpacity={1}
                onPress={() => setShowRestPicker(false)}
              >
                <TouchableOpacity 
                  activeOpacity={1}
                  onPress={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: theme.card,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    paddingTop: theme.spacing.lg,
                    paddingBottom: Platform.OS === 'ios' ? 50 : theme.spacing.xl,
                    ...theme.shadow.lg,
                  }}
                >
                  {/* Header */}
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.xl,
                    paddingBottom: theme.spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}>
                    <TouchableOpacity 
                      onPress={() => setShowRestPicker(false)}
                      style={{
                        paddingVertical: theme.spacing.xs,
                        paddingHorizontal: theme.spacing.sm,
                      }}
                    >
                      <Text style={{ 
                        fontSize: theme.fontSize.base, 
                        color: theme.textSecondary,
                        fontWeight: theme.fontWeight.medium,
                      }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ 
                        fontSize: theme.fontSize.sm, 
                        fontWeight: theme.fontWeight.semibold, 
                        color: theme.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        Rest Time
                      </Text>
                      <Text style={{ 
                        fontSize: theme.fontSize['2xl'], 
                        fontWeight: theme.fontWeight.bold, 
                        color: theme.text,
                        marginTop: 4,
                      }}>
                        {formatTime(restMins * 60 + restSecs)}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setShowRestPicker(false)}
                      style={{
                        paddingVertical: theme.spacing.xs,
                        paddingHorizontal: theme.spacing.sm,
                        backgroundColor: theme.text,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ 
                        fontSize: theme.fontSize.base, 
                        fontWeight: theme.fontWeight.semibold, 
                        color: theme.background,
                      }}>
                        Done
                      </Text>
                    </TouchableOpacity>
                  </View>
                  
                  {/* Picker Container */}
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.xl,
                    paddingTop: theme.spacing.lg,
                    height: 220,
                  }}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ 
                        fontSize: theme.fontSize.xs, 
                        color: theme.textTertiary, 
                        marginBottom: theme.spacing.xs,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        fontWeight: theme.fontWeight.medium,
                      }}>
                        Minutes
                      </Text>
                      <Picker
                        selectedValue={restMins}
                        onValueChange={(itemValue) => {
                          setRestSec(String(itemValue * 60 + restSecs));
                        }}
                        style={{ 
                          flex: 1, 
                          width: '100%',
                        }}
                        itemStyle={{ 
                          color: theme.text,
                          fontSize: theme.fontSize['2xl'],
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={String(i)} value={i} />
                        ))}
                      </Picker>
                    </View>
                    
                    {/* Separator */}
                    <View style={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.md,
                      paddingTop: 40,
                    }}>
                      <Text style={{
                        fontSize: theme.fontSize['3xl'],
                        fontWeight: theme.fontWeight.bold,
                        color: theme.text,
                      }}>
                        :
                      </Text>
                    </View>
                    
                    <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ 
              fontSize: theme.fontSize.xs, 
              color: theme.textTertiary, 
                        marginBottom: theme.spacing.xs,
                        textTransform: 'uppercase',
                        letterSpacing: 1,
              fontWeight: theme.fontWeight.medium,
            }}>
                        Seconds
            </Text>
                      <Picker
                        selectedValue={restSecs}
                        onValueChange={(itemValue) => {
                          setRestSec(String(restMins * 60 + itemValue));
                        }}
                        style={{ 
                          flex: 1, 
                          width: '100%',
                        }}
                        itemStyle={{ 
                          color: theme.text,
                          fontSize: theme.fontSize['2xl'],
                          fontWeight: theme.fontWeight.semibold,
                        }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <Picker.Item key={i} label={String(i).padStart(2, '0')} value={i} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
        </View>

          {/* Total Duration - Output Only */}
        <View style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: theme.fontSize.sm, 
              fontWeight: theme.fontWeight.medium, 
              color: theme.textSecondary, 
              marginBottom: theme.spacing.xs,
            }}>
              Total Duration
          </Text>
            <View style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 8,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              backgroundColor: theme.cardSecondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ 
                fontSize: theme.fontSize.xl, 
                fontWeight: theme.fontWeight.semibold,
                color: theme.text,
                textAlign: 'center',
              }}>
                {totalDurationDisplay}
            </Text>
            </View>
          </View>
        </View>
      </View>
      </View>
    </View>
  );
};
