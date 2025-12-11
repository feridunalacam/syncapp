import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';

export default function RoutineListScreen({ navigation }) {
  const { routines, reorderRoutines, deleteRoutine } = useRoutineContext();
  const { theme } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark: theme.background === '#000000' });
  const [longPressIndex, setLongPressIndex] = useState(null);

  const handleDeleteRoutine = (routine) => {
    Alert.alert(
      'Delete Routine',
      `Are you sure you want to delete "${routine.name}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRoutine(routine.id),
        },
      ],
      { cancelable: true }
    );
  };

  const handleDragGesture = (event, index) => {
    const { translationY, state } = event.nativeEvent;
    
    if (state === State.BEGAN) {
      // Drag started
    } else if (state === State.ACTIVE) {
      // Calculate approximate height of each card based on content
      // Routine card has header + meta row, similar to RoundEditor structure
      const itemHeight = 50; // Approximate height, matches RoundEditor
      const deltaIndex = Math.round(translationY / itemHeight);
      const newIndex = Math.max(0, Math.min(routines.length - 1, index + deltaIndex));
      
      if (newIndex !== index && newIndex >= 0) {
        reorderRoutines(index, newIndex);
      }
    } else if (state === State.END || state === State.CANCELLED) {
      // Drag ended
    }
  };

  const renderRoutineCard = (routine, index) => {
    const totalDuration = routine.rounds * (routine.workSec + routine.restSec);
    const minutes = Math.floor(totalDuration / 60);
    const seconds = totalDuration % 60;
    const durationLabel = `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;

    const isLongPressed = longPressIndex === index;
    const showReorderControls = isLongPressed;
    const isLastCard = index === routines.length - 1;
    const isFirstCard = index === 0;

    // Border radius logic: only first and last cards have curved corners
    // If it's both first and last (only one card), all corners should be rounded
    const borderRadiusStyle = isFirstCard && isLastCard
      ? { borderRadius: 12 }
      : isFirstCard
      ? { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
      : isLastCard
      ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }
      : { borderRadius: 0 };

    const cardStyle = [
      screenStyles.routineCard,
      borderRadiusStyle,
      showReorderControls && { opacity: 0.85 },
      !isLastCard && { borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: theme.spacing.md },
    ];

    return (
      <View key={routine.id} style={{ paddingHorizontal: theme.spacing.xl }}>
        <TouchableOpacity
          style={cardStyle}
          activeOpacity={0.85}
          onPress={() => {
            if (!isLongPressed) {
              navigateToCreateRoutine(navigation, routine);
            }
          }}
          accessibilityRole="button"
          accessibilityHint="Tap to use as template for new routine, long press drag handle to reorder"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <PanGestureHandler
              onGestureEvent={(event) => handleDragGesture(event, index)}
              onHandlerStateChange={(event) => handleDragGesture(event, index)}
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
              <View style={{ flex: 1 }}>
                <View style={screenStyles.routineCardHeader}>
                  <Text style={screenStyles.roundTitle}>{routine.name}</Text>
                </View>

                <View style={screenStyles.routineMetaRow}>
                  <View style={screenStyles.routineMetaPill}>
                    <Ionicons name="barbell-outline" size={12} color={theme.iconPrimary} />
                    <Text style={screenStyles.routineMetaText}>{routine.rounds} rounds</Text>
                  </View>
                  <View style={screenStyles.routineMetaPill}>
                    <Ionicons name="flash-outline" size={12} color={theme.iconPrimary} />
                    <Text style={screenStyles.routineMetaText}>{routine.workSec}s work</Text>
                  </View>
                  <View style={screenStyles.routineMetaPill}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color={theme.iconPrimary} />
                    <Text style={screenStyles.routineMetaText}>
                      {routine.restSec > 0 ? `${routine.restSec}s rest` : 'No rest'}
                    </Text>
                  </View>
                  <View style={screenStyles.routineMetaPill}>
                    <Ionicons name="time-outline" size={12} color={theme.iconPrimary} />
                    <Text style={screenStyles.routineMetaText}>~ {durationLabel}</Text>
                  </View>
                </View>
              </View>
              <View style={{ alignSelf: 'center' }}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteRoutine(routine);
                  }}
                  style={screenStyles.routineDeleteButton}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.iconSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {showReorderControls && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.border }}>
                <TouchableOpacity
                  style={[screenStyles.reorderButton, index === 0 && screenStyles.reorderButtonDisabled]}
                  onPress={() => {
                    if (index > 0) {
                      reorderRoutines(index, index - 1);
                      setLongPressIndex(null);
                    }
                  }}
                  disabled={index === 0}
                >
                  <Ionicons name="chevron-up" size={18} color={index === 0 ? theme.textTertiary : theme.iconPrimary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[screenStyles.reorderButton, index === routines.length - 1 && screenStyles.reorderButtonDisabled]}
                  onPress={() => {
                    if (index < routines.length - 1) {
                      reorderRoutines(index, index + 1);
                      setLongPressIndex(null);
                    }
                  }}
                  disabled={index === routines.length - 1}
                >
                  <Ionicons name="chevron-down" size={18} color={index === routines.length - 1 ? theme.textTertiary : theme.iconPrimary} />
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScreenWrapper style={screenStyles.container}>
      <View style={screenStyles.pageHeader}>
        <View style={[screenStyles.pageHeaderContent, { marginBottom: theme.spacing.sm }]}>
          <Text style={screenStyles.pageTitle}>Routines</Text>
          <TouchableOpacity
            style={screenStyles.addButton}
            onPress={() => navigateToCreateRoutine(navigation)}
          >
            <Text style={screenStyles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      {routines.length === 0 ? (
        <View style={[screenStyles.centeredContent, { flex: 1, paddingHorizontal: theme.spacing.xl }]}>
          <Text style={screenStyles.description}>No routines yet. Tap "Create Routine" to build one.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[screenStyles.roundList, { paddingHorizontal: 0 }]}>
          {routines.map((routine, index) => renderRoutineCard(routine, index))}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}
