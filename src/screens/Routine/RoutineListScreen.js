import Surface from '../../components/common/Surface';
import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoutineContext } from '../../context/RoutineContext';
import IntervalPreview from '../../components/common/IntervalPreview';
import { useWorkout } from '../../context/WorkoutContext';
import { useTheme } from '../../context/ThemeContext';
import useConfirm from '../../hooks/useConfirm';
import { getRoutineDuration } from '../../domain/routines';
import { formatTime } from '../../utils/timeFormatters';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import ScreenHeader from '../../components/common/ScreenHeader';
import { EmptyState } from '../../components/common/StateViews';
import { navigateToCreateRoutine } from '../../navigation/navigationHelpers';
export default function RoutineListScreen({ navigation, embedded = false }) {
  const { routines, reorderRoutines, deleteRoutine } = useRoutineContext();
  const { theme } = useTheme();
  const confirm = useConfirm();
  const { selectRoutine, selectedRoutine, isWorkoutRunning } = useWorkout();
  const openRoutine = (routine) => {
    const open = () => {
      if (selectedRoutine?.id !== routine.id) selectRoutine(routine.id);
      navigation.navigate('Home');
    };
    if (isWorkoutRunning && selectedRoutine?.id !== routine.id)
      confirm({
        title: 'Switch routine?',
        message: 'This ends your current session.',
        confirmLabel: 'Switch',
        onConfirm: open,
      });
    else open();
  };
  const [organizing, setOrganizing] = useState(false);
  const remove = (r) =>
    confirm({
      title: 'Delete routine?',
      message: `Remove “${r.name}” from your routines?`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => deleteRoutine(r.id),
    });
  const Frame = embedded ? View : ScreenWrapper;
  return (
    <Frame style={{ flex: 1 }}>
      {!embedded && (
        <ScreenHeader
          title="Routines"
          subtitle=""
          actionLabel="Create routine"
          onAction={() => navigateToCreateRoutine(navigation)}
        />
      )}
      {!routines.length ? (
        <EmptyState
          icon="layers-outline"
          title="No routines yet"
          description="Create a routine to start a session."
          actionLabel="Create routine"
          onAction={() => navigateToCreateRoutine(navigation)}
        />
      ) : (
        <FlatList
          data={routines}
          keyExtractor={(routine) => routine.id}
          extraData={organizing}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.section}>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {routines.length} saved routines
              </Text>
              <Pressable onPress={() => setOrganizing(!organizing)} hitSlop={12}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.accent }}>
                  {organizing ? 'Done' : 'Organize'}
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item: r, index }) => (
            <Surface
              variant="card"
              key={r.id}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Pressable
                onPress={() => navigateToCreateRoutine(navigation, r)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${r.name}`}
                style={styles.row}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', color: theme.text }}>
                    {r.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 6 }}>
                    {r.rounds} rounds · {formatTime(getRoutineDuration(r))} total
                  </Text>
                </View>
                <Ionicons name="create-outline" size={19} color={theme.textSecondary} />
              </Pressable>
              <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <IntervalPreview routine={r} height={7} />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 14,
                  }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                    {formatTime(r.workSec)} work · {formatTime(r.restSec)} rest
                  </Text>
                  <Pressable
                    onPress={() => openRoutine(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${r.name} in Timer`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 13,
                      backgroundColor: theme.accentLight,
                    }}
                  >
                    <Ionicons name="play" size={12} color={theme.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.accent }}>
                      Open
                    </Text>
                  </Pressable>
                </View>
              </View>
              {organizing && (
                <View style={[styles.actions, { borderColor: theme.border }]}>
                  {[
                    {
                      icon: 'arrow-up',
                      label: `Move ${r.name} up`,
                      disabled: index === 0,
                      onPress: () => reorderRoutines(index, index - 1),
                    },
                    {
                      icon: 'arrow-down',
                      label: `Move ${r.name} down`,
                      disabled: index === routines.length - 1,
                      onPress: () => reorderRoutines(index, index + 1),
                    },
                    { icon: 'trash-outline', label: `Delete ${r.name}`, onPress: () => remove(r) },
                  ].map((a) => (
                    <Pressable
                      key={a.icon}
                      onPress={a.onPress}
                      disabled={a.disabled}
                      accessibilityLabel={a.label}
                      style={styles.action}
                    >
                      <Ionicons
                        name={a.icon}
                        size={19}
                        color={
                          a.disabled
                            ? theme.textTertiary
                            : a.icon === 'trash-outline'
                              ? theme.error
                              : theme.text
                        }
                      />
                    </Pressable>
                  ))}
                </View>
              )}
            </Surface>
          )}
        />
      )}
    </Frame>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    overflow: 'hidden',
  },
  row: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 15 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  action: { padding: 14 },
});
