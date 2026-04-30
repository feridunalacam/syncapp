import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

// Android needs an opt-in for LayoutAnimation. iOS supports it out of the box.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import Ionicons from '@expo/vector-icons/Ionicons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import useConfirm from '../../hooks/useConfirm';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import { EmptyState } from '../../components/common/StateViews';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';

export default function RoutineListScreen({ navigation }) {
  const { routines, reorderRoutines, deleteRoutine } = useRoutineContext();
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const confirm = useConfirm();

  const handleDeleteRoutine = (routine) => {
    confirm({
      title: 'Delete Routine',
      message: `Are you sure you want to delete "${routine.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        // Slide adjacent rows into the freed space instead of snapping.
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        deleteRoutine(routine.id);
      },
    });
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

    const isLastCard = index === routines.length - 1;
    const isFirstCard = index === 0;

    // Border radius logic: only first and last cards have curved corners
    // If it's both first and last (only one card), all corners should be rounded
    const borderRadiusStyle = isFirstCard && isLastCard
      ? { borderRadius: theme.radius.md }
      : isFirstCard
      ? { borderTopLeftRadius: theme.radius.md, borderTopRightRadius: theme.radius.md, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
      : isLastCard
      ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: theme.radius.md, borderBottomRightRadius: theme.radius.md }
      : { borderRadius: 0 };

    const cardStyle = [
      screenStyles.routineCard,
      borderRadiusStyle,
      !isLastCard && { borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: theme.spacing.md },
    ];

    return (
      <View key={routine.id} style={{ paddingHorizontal: theme.spacing.xl }}>
        <TouchableOpacity
          style={cardStyle}
          activeOpacity={0.85}
          onPress={() => navigateToCreateRoutine(navigation, routine)}
          accessibilityRole="button"
          accessibilityHint="Tap to use as template for a new routine. Drag the handle on the left to reorder."
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
                accessibilityRole="adjustable"
                accessibilityLabel={`Reorder ${routine.name}. Drag up or down to move.`}
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
                  accessibilityRole="button"
                  accessibilityLabel={`Delete routine ${routine.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={theme.iconSize.md} color={theme.iconSecondary} />
                </TouchableOpacity>
              </View>
            </View>
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
            accessibilityRole="button"
            accessibilityLabel="Create new routine"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={screenStyles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      {routines.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="No routines yet"
          description="Build your first routine to start training. You can save work/rest times, attach playlists, and reuse it across sessions."
          actionLabel="Create Routine"
          onAction={() => navigateToCreateRoutine(navigation)}
        />
      ) : (
        <ScrollView contentContainerStyle={[screenStyles.roundList, { paddingHorizontal: 0 }]}>
          {routines.map((routine, index) => renderRoutineCard(routine, index))}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}
