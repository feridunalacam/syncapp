import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, Modal, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { createScreenStyles } from '../../../styles/screenStyles';

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

// Helper function to filter out non-numeric characters
const filterNumeric = (text) => {
  return text.replace(/[^0-9]/g, '');
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

export const RoundEditor = ({
  roundNum,
  workSec,
  restSec,
  onWorkSecChange,
  onRestSecChange,
  workSong,
  restSong,
  workPlaylist,
  restPlaylist,
  onWorkMusicPress,
  onRestMusicPress,
  onRemoveWorkMusic,
  onRemoveRestMusic,
  onRemoveRound,
  isLast = false,
  defaultWorkSec,
  defaultRestSec,
  onReorderRound,
  index,
}) => {
  const { theme } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark: theme.background === '#000000' });
  const [isExpanded, setIsExpanded] = useState(false);
  const [showWorkPicker, setShowWorkPicker] = useState(false);
  const [showRestPicker, setShowRestPicker] = useState(false);
  const [workTimeWidth, setWorkTimeWidth] = useState(null);
  const [restTimeWidth, setRestTimeWidth] = useState(null);
  const workTimeRef = useRef(null);
  const restTimeRef = useRef(null);
  
  const workMins = Math.floor(parseInt(workSec || 0) / 60);
  const workSecs = parseInt(workSec || 0) % 60;
  const restMins = Math.floor(parseInt(restSec || 0) / 60);
  const restSecs = parseInt(restSec || 0) % 60;
  
  // Check if round has custom settings
  const hasCustomSettings = workSec !== defaultWorkSec || restSec !== defaultRestSec || workSong || restSong || workPlaylist || restPlaylist;

  const handleDragGesture = (event) => {
    if (!onReorderRound) return;
    const { translationY, state } = event.nativeEvent;
    
    if (state === State.BEGAN) {
      // Drag started
    } else if (state === State.ACTIVE) {
      const itemHeight = 50; // Approximate height of each round bar
      const deltaIndex = Math.round(translationY / itemHeight);
      const newIndex = Math.max(0, Math.min(index + deltaIndex, 999)); // Adjust max based on total rounds
      
      if (newIndex !== index && newIndex >= 0) {
        onReorderRound(index, newIndex);
      }
    } else if (state === State.END || state === State.CANCELLED) {
      // Drag ended
    }
  };
  
  const horizontalPadding = theme.spacing.md;
  
  return (
    <View>
      <View style={[
        screenStyles.routineCard,
        { 
          paddingHorizontal: horizontalPadding,
          paddingVertical: theme.spacing.md,
        },
        !isLast && { paddingBottom: theme.spacing.md },
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Drag Icon - Left side, vertically centered */}
        {onReorderRound && (
            <View style={{ alignSelf: 'center', marginRight: theme.spacing.sm }}>
          <PanGestureHandler
            onGestureEvent={handleDragGesture}
            onHandlerStateChange={handleDragGesture}
            minPointers={1}
          >
            <TouchableOpacity
              style={{
                padding: theme.spacing.xs,
                    marginLeft: -theme.spacing.xs,
              }}
              activeOpacity={0.6}
            >
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    <View style={{ flexDirection: 'column', gap: 3 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                </View>
                    <View style={{ flexDirection: 'column', gap: 3 }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.iconTertiary }} />
                </View>
              </View>
            </TouchableOpacity>
          </PanGestureHandler>
            </View>
        )}
          
          {/* Round Number Icon - Right after drag icon */}
          <View style={{ alignSelf: 'center', marginRight: theme.spacing.sm }}>
        <View style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: theme.cardSecondary,
          alignItems: 'center',
          justifyContent: 'center',
            }}>
              <Text style={{
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.bold,
                color: theme.text,
              }}>{roundNum}</Text>
            </View>
          </View>
          
          {/* Main Content */}
          <View style={{ flex: 1 }}>
            {/* Top Row: Work, Rest */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
              
              {/* Work Time with - + buttons */}
              <View 
                ref={workTimeRef}
                onLayout={(event) => {
                  const { width } = event.nativeEvent.layout;
                  if (!workTimeWidth) {
                    setWorkTimeWidth(width);
                  }
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, justifyContent: 'center' }}
              >
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(workSec || 0);
                    const newValue = Math.max(0, current - 5);
                    onWorkSecChange(String(newValue));
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
          backgroundColor: theme.cardSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={parseInt(workSec || 0) <= 0}
                >
                  <Ionicons 
                    name="remove" 
                    size={14} 
                    color={parseInt(workSec || 0) <= 0 ? theme.textTertiary : theme.text} 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => setShowWorkPicker(true)}
                  activeOpacity={0.7}
                  style={{ 
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    minWidth: 60,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="flash-outline" size={16} color={theme.iconPrimary} />
                  <Text style={{
                    fontSize: theme.fontSize.sm * 1.1,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.text,
                  }}>
                    {formatTime(parseInt(workSec || 0))}
                  </Text>
                </TouchableOpacity>
        
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(workSec || 0);
                    const newValue = current + 5;
                    onWorkSecChange(String(newValue));
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.cardSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={14} color={theme.text} />
                </TouchableOpacity>
              </View>
              
              {/* Rest Time with - + buttons */}
              <View 
                ref={restTimeRef}
                onLayout={(event) => {
                  const { width } = event.nativeEvent.layout;
                  if (!restTimeWidth) {
                    setRestTimeWidth(width);
                  }
                }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, justifyContent: 'center' }}
              >
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(restSec || 0);
                    const newValue = Math.max(0, current - 5);
                    onRestSecChange(String(newValue));
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.cardSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  disabled={parseInt(restSec || 0) <= 0}
                >
                  <Ionicons 
                    name="remove" 
                    size={14} 
                    color={parseInt(restSec || 0) <= 0 ? theme.textTertiary : theme.text} 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => setShowRestPicker(true)}
                  activeOpacity={0.7}
                  style={{ 
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    minWidth: 60,
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.iconPrimary} />
                  <Text style={{ 
                    fontSize: theme.fontSize.sm * 1.1,
                    fontWeight: theme.fontWeight.semibold,
                    color: theme.text,
                  }}>
                    {formatTime(parseInt(restSec || 0))}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(restSec || 0);
                    const newValue = current + 5;
                    onRestSecChange(String(newValue));
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.cardSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={14} color={theme.text} />
                </TouchableOpacity>
              </View>
            </View>

          {/* Bottom Row: Add Music Work, Add Music Rest */}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.sm,
                borderWidth: 1,
                borderColor: (workSong || workPlaylist) ? theme.borderDark : theme.border,
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: theme.card,
              }}
              onPress={onWorkMusicPress}
              activeOpacity={0.7}
            >
              {(workSong || workPlaylist) ? (
                <>
                  {((workSong?.image && workSong.image.trim() !== '') || (workPlaylist?.image && workPlaylist.image.trim() !== '')) ? (
                    <Image 
                      source={{ uri: workSong?.image || workPlaylist?.image }} 
                      style={{ width: 24, height: 24, borderRadius: 4 }} 
                    />
                  ) : (
                    <View style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      backgroundColor: theme.cardSecondary,
                      borderWidth: 1,
                      borderColor: theme.borderDark,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={workSong ? "musical-note" : "albums"} size={12} color={theme.iconTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text 
                      style={{ 
            fontSize: theme.fontSize.xs, 
                        fontWeight: theme.fontWeight.semibold,
                        color: theme.text,
                      }} 
                      numberOfLines={1}
                    >
                      {workSong?.name || workPlaylist?.name}
                    </Text>
                    {(workSong?.artist || workPlaylist?.owner) && (
                      <Text 
                        style={{ 
                          fontSize: theme.fontSize.xs - 1, 
            color: theme.textSecondary,
                          marginTop: 2,
                        }} 
                        numberOfLines={1}
                      >
                        {workSong?.artist || workPlaylist?.owner}
          </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    onPress={(e) => {
                      e.stopPropagation();
                      onRemoveWorkMusic();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={14} color={theme.iconTertiary} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Ionicons name="musical-note" size={14} color={theme.iconTertiary} />
                  <Text 
                    style={{ 
            fontSize: theme.fontSize.xs, 
            color: theme.textTertiary,
                    }} 
                  >
                    Add Work Music
          </Text>
                </>
              )}
            </TouchableOpacity>
        
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: theme.spacing.sm,
                paddingHorizontal: theme.spacing.sm,
                borderWidth: 1,
                borderColor: (restSong || restPlaylist) ? theme.borderDark : theme.border,
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: theme.card,
              }}
              onPress={onRestMusicPress}
              activeOpacity={0.7}
            >
              {(restSong || restPlaylist) ? (
                <>
                  {((restSong?.image && restSong.image.trim() !== '') || (restPlaylist?.image && restPlaylist.image.trim() !== '')) ? (
                    <Image 
                      source={{ uri: restSong?.image || restPlaylist?.image }} 
                      style={{ width: 24, height: 24, borderRadius: 4 }} 
                    />
                  ) : (
                    <View style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      backgroundColor: theme.cardSecondary,
                      borderWidth: 1,
                      borderColor: theme.borderDark,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Ionicons name={restSong ? "musical-note" : "albums"} size={12} color={theme.iconTertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text 
                      style={{ 
                        fontSize: theme.fontSize.xs, 
                        fontWeight: theme.fontWeight.semibold,
                        color: theme.text,
                      }} 
                      numberOfLines={1}
                    >
                      {restSong?.name || restPlaylist?.name}
                    </Text>
                    {(restSong?.artist || restPlaylist?.owner) && (
                      <Text 
                        style={{ 
                          fontSize: theme.fontSize.xs - 1, 
                          color: theme.textSecondary,
                          marginTop: 2,
                        }} 
                        numberOfLines={1}
                      >
                        {restSong?.artist || restPlaylist?.owner}
                      </Text>
                    )}
                  </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
                      onRemoveRestMusic();
          }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={14} color={theme.iconTertiary} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Ionicons name="musical-note" size={14} color={theme.iconTertiary} />
                  <Text 
          style={{
                      fontSize: theme.fontSize.xs, 
                      color: theme.textTertiary,
          }}
        >
                    Add Rest Music
                  </Text>
                </>
              )}
        </TouchableOpacity>
          </View>
          </View>
          
          {/* Trash Icon - Right side, vertically centered */}
          <View style={{ alignSelf: 'center', marginLeft: theme.spacing.sm }}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onRemoveRound(roundNum);
              }}
              style={screenStyles.routineDeleteButton}
            >
              <Ionicons name="trash-outline" size={16} color={theme.iconSecondary} />
      </TouchableOpacity>
          </View>
        </View>

      {/* Expanded Content - Time Editors */}
      {isExpanded && (
        <View style={{ marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.border }}>
          {/* Inline Time Editors - Unified Format */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flex: 1, marginBottom: theme.spacing.md }}>
            {/* Work Time */}
            <View style={{ flex: 1 }}>
              <Text style={{ 
                fontSize: theme.fontSize.xs,
                color: theme.textSecondary, 
                fontWeight: theme.fontWeight.medium,
                marginBottom: 2,
              }}>
                Work
              </Text>
              <TouchableOpacity
                onPress={() => setShowWorkPicker(true)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  borderRadius: 6,
                  paddingVertical: 4,
                  paddingHorizontal: theme.spacing.lg,
                  backgroundColor: theme.inputBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{
                  fontSize: theme.fontSize.sm,
                  fontWeight: theme.fontWeight.semibold,
                  color: theme.inputText,
                  textAlign: 'center',
                }}>
                  {formatTime(parseInt(workSec || 0))}
                </Text>
              </TouchableOpacity>
          </View>
          
          {/* Rest Time */}
          <View style={{ flex: 1 }}>
            <Text style={{ 
                  fontSize: theme.fontSize.xs,
              color: theme.textSecondary, 
                  fontWeight: theme.fontWeight.medium,
              marginBottom: 2,
            }}>
              Rest
            </Text>
            <TouchableOpacity
              onPress={() => setShowRestPicker(true)}
              style={{
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                borderRadius: 6,
                paddingVertical: 4,
                paddingHorizontal: theme.spacing.xs,
                  backgroundColor: theme.inputBackground,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{
                fontSize: theme.fontSize.sm,
                fontWeight: theme.fontWeight.semibold,
                color: theme.inputText,
                textAlign: 'center',
              }}>
                {formatTime(parseInt(restSec || 0))}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

                    </View>
                  )}
                  </View>
      {!isLast && (
                  <View style={{
          height: 1,
          backgroundColor: theme.border,
          marginLeft: -horizontalPadding,
          marginRight: -horizontalPadding,
        }} />
        )}

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
                    onWorkSecChange(String(itemValue * 60 + workSecs));
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
                    onWorkSecChange(String(workMins * 60 + itemValue));
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
                    onRestSecChange(String(itemValue * 60 + restSecs));
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
                    onRestSecChange(String(restMins * 60 + itemValue));
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
  );
};
