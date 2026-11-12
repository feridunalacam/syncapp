import Surface from '../../components/common/Surface';
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import ScreenHeader from '../../components/common/ScreenHeader';
import GlassSurface from '../../components/common/GlassSurface';
import Sheet from '../../components/common/Sheet';
import { EmptyState } from '../../components/common/StateViews';
import { getLogDuration, getLogRounds, getRoutineDuration } from '../../domain/routines';
import { formatTime } from '../../utils/timeFormatters';
import { useLogData } from './hooks/useLogData';
import SessionShareCard from './components/SessionShareCard';

const SHARE_CAPTURE_OPTIONS = { format: 'png', quality: 1, result: 'data-uri' };

export default function LogScreen({ embedded = false }) {
  const { theme } = useTheme();
  const { state, setters, refs, derived, handlers } = useLogData();
  const {
    selectedLog,
    isEditMode,
    showDetailModal,
    showPublishModal,
    showShareModal,
    publishCaption,
    publishCategory,
    generatedImages,
    isGenerating,
    isCapturing,
  } = state;
  const sections = React.useMemo(
    () =>
      Object.entries(derived.groupedRoutines).map(([title, data]) => ({ key: title, title, data })),
    [derived.groupedRoutines],
  );
  const action = (label, icon, onPress, primary = false) => {
    const ActionSurface = primary ? View : GlassSurface;
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        disabled={isGenerating || isCapturing}
      >
        <ActionSurface
          {...(!primary ? { interactive: true } : {})}
          style={[styles.button, primary && { backgroundColor: theme.accent }]}
        >
          <Ionicons name={icon} size={19} color={primary ? theme.accentText : theme.accent} />
          <Text
            style={{
              color: primary ? theme.accentText : theme.text,
              fontWeight: '600',
              fontSize: 14,
            }}
          >
            {label}
          </Text>
        </ActionSurface>
      </Pressable>
    );
  };
  const Frame = embedded ? View : ScreenWrapper;
  return (
    <Frame style={{ flex: 1 }}>
      {!embedded && (
        <ScreenHeader
          title="Activity"
          subtitle=""
          icon={isEditMode ? 'checkmark' : 'ellipsis-horizontal'}
          actionLabel={isEditMode ? 'Finish editing activity' : 'Edit activity'}
          onAction={derived.hasLogs ? handlers.toggleEditMode : undefined}
        />
      )}
      {embedded && derived.hasLogs && (
        <Pressable
          onPress={handlers.toggleEditMode}
          accessibilityLabel="Edit session history"
          style={{ alignSelf: 'flex-end', paddingHorizontal: 20, paddingBottom: 12 }}
        >
          <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '600' }}>
            {isEditMode ? 'Done' : 'Manage'}
          </Text>
        </Pressable>
      )}
      {!derived.hasLogs ? (
        <EmptyState
          icon="pulse-outline"
          title="No sessions yet"
          description="Start a routine and your sessions will appear here."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(log, index) => log.sessionId || `${log.id}-${log.completedAt}-${index}`}
          extraData={isEditMode}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={[styles.stats, { borderColor: theme.border }]}>
                {[
                  [derived.stats.totalWorkouts, 'Sessions'],
                  [derived.stats.totalRounds, 'Rounds'],
                  [derived.stats.totalTime, 'Time'],
                ].map(([value, label], index) => (
                  <View
                    key={label}
                    style={[
                      styles.stat,
                      index > 0 && {
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: theme.border,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={{
                        fontSize: 26,
                        fontWeight: '600',
                        letterSpacing: -0.7,
                        color: theme.text,
                      }}
                    >
                      {value}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 5 }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
              {isEditMode && (
                <Pressable onPress={handlers.handleClearAll} style={{ paddingVertical: 16 }}>
                  <Text style={{ color: theme.error }}>Clear all activity</Text>
                </Pressable>
              )}
            </>
          }
          renderSectionHeader={({ section }) => (
            <Text style={[styles.section, { color: theme.textSecondary }]}>{section.title}</Text>
          )}
          renderItem={({ item: log }) => (
            <Surface
              variant="card"
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Pressable
                style={styles.row}
                onPress={() => handlers.handleLogPress(log)}
                accessibilityRole="button"
                accessibilityLabel={`View ${log.name} session`}
              >
                <View style={[styles.icon, { backgroundColor: theme.cardSecondary }]}>
                  <Ionicons
                    name={log.status === 'aborted' ? 'pause-outline' : 'checkmark'}
                    size={20}
                    color={log.status === 'aborted' ? theme.textSecondary : theme.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: theme.text,
                      fontSize: 16,
                      lineHeight: 21,
                      fontWeight: '600',
                    }}
                  >
                    {log.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 11,
                      lineHeight: 16,
                      marginTop: 4,
                    }}
                  >
                    {formatTime(getLogDuration(log))} · {getLogRounds(log)} rounds ·{' '}
                    {handlers.formatTime(log)}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 10,
                      lineHeight: 14,
                      marginTop: 3,
                    }}
                  >
                    {log.status === 'aborted'
                      ? 'Ended early'
                      : log.skippedPhases
                        ? 'Finished with skipped intervals'
                        : 'Completed'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
              </Pressable>
              {isEditMode && (
                <Pressable
                  onPress={() => handlers.handleDeleteLog(log)}
                  accessibilityLabel={`Delete ${log.name} session`}
                  style={styles.delete}
                >
                  <Ionicons name="trash-outline" color={theme.error} size={19} />
                </Pressable>
              )}
            </Surface>
          )}
        />
      )}
      <Sheet
        visible={showDetailModal}
        title={selectedLog?.name || 'Session'}
        onClose={() => setters.setShowDetailModal(false)}
      >
        <ScrollView>
          {selectedLog && (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {new Date(selectedLog.completedAt).toLocaleString()}
              </Text>
              <Text
                style={{ color: theme.text, fontSize: 58, fontWeight: '300', marginVertical: 22 }}
              >
                {formatTime(getLogDuration(selectedLog))}
              </Text>
              <Text style={{ color: theme.text, fontSize: 15, marginBottom: 8 }}>
                {getLogRounds(selectedLog)} of {selectedLog.rounds} round
                {selectedLog.rounds === 1 ? '' : 's'} completed
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  lineHeight: 21,
                  marginBottom: 22,
                }}
              >
                {selectedLog.status === 'aborted'
                  ? 'This session ended early.'
                  : 'Session finished.'}{' '}
                Planned time: {formatTime(getRoutineDuration(selectedLog))}. Pauses are excluded
                from new session records.
                {selectedLog.skippedPhases > 0
                  ? ` ${selectedLog.skippedPhases} interval skips.`
                  : ''}
              </Text>
              {action(
                isGenerating ? 'Preparing…' : 'Create share image',
                'share-outline',
                handlers.handleShare,
                true,
              )}
              {action(
                'Save to Discover on this device',
                'add-circle-outline',
                handlers.handlePublish,
              )}
            </>
          )}
        </ScrollView>
      </Sheet>
      <Sheet
        visible={showPublishModal}
        title="Save your session"
        onClose={() => setters.setShowPublishModal(false)}
      >
        <Text style={{ color: theme.textSecondary, lineHeight: 20, marginBottom: 18 }}>
          This post stays on this device. Use a share image to send it to friends.
        </Text>
        <TextInput
          value={publishCaption}
          onChangeText={setters.setPublishCaption}
          placeholder="How did it feel?"
          placeholderTextColor={theme.textTertiary}
          multiline
          maxLength={500}
          style={[styles.input, { color: theme.text, backgroundColor: theme.inputBackground }]}
        />
        <View style={styles.categories}>
          {['sport', 'learn', 'study'].map((category) => (
            <Pressable
              key={category}
              onPress={() => setters.setPublishCategory(category)}
              style={[
                styles.chip,
                { backgroundColor: publishCategory === category ? theme.accent : theme.card },
              ]}
            >
              <Text style={{ color: publishCategory === category ? theme.accentText : theme.text }}>
                {category}
              </Text>
            </Pressable>
          ))}
        </View>
        {action('Save session post', 'checkmark', handlers.confirmPublish, true)}
      </Sheet>
      <Sheet
        visible={showShareModal}
        title="Share session"
        onClose={() => setters.setShowShareModal(false)}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {generatedImages.full && (
            <Image
              source={{ uri: generatedImages.full }}
              style={{ width: '100%', height: 280, resizeMode: 'contain', marginBottom: 16 }}
            />
          )}
          {isCapturing && <ActivityIndicator color={theme.accent} />}
          {action('Copy image', 'copy-outline', () => handlers.handleCopyImage('full'), true)}
          {action('Copy transparent sticker', 'layers-outline', () =>
            handlers.handleCopyImage('transparent'),
          )}
          {action('Share session text', 'share-outline', () =>
            handlers.handleShareToPlatform('native'),
          )}
        </ScrollView>
      </Sheet>
      {selectedLog && (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.capture}
        >
          <ViewShot ref={refs.shareCardRef} options={SHARE_CAPTURE_OPTIONS}>
            <SessionShareCard session={selectedLog} />
          </ViewShot>
          <ViewShot ref={refs.shareCardTransparentRef} options={SHARE_CAPTURE_OPTIONS}>
            <SessionShareCard session={selectedLog} transparent />
          </ViewShot>
        </View>
      )}
    </Frame>
  );
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  stats: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 22,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, minWidth: 0, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center' },
  section: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 12 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  delete: { padding: 14, alignSelf: 'flex-end' },
  button: {
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    borderRadius: 22,
  },
  input: { padding: 16, borderRadius: 18, minHeight: 100, fontSize: 15, textAlignVertical: 'top' },
  categories: { flexDirection: 'row', gap: 10, marginVertical: 18 },
  chip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18 },
  capture: { position: 'absolute', left: -10000, top: 0 },
});
