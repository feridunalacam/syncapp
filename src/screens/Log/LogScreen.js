import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, TextInput, Platform, Image, ActivityIndicator, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import { EmptyState } from '../../components/common/StateViews';
import { formatDate } from '../../utils/timeFormatters';
import { useLogData } from './hooks/useLogData';

export default function LogScreen({ navigation }) {
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const logStyles = createLogStyles({ ...theme, isDark });
  const {
    state: {
      selectedLog,
      isEditMode,
      showDetailModal,
      showPublishModal,
      showShareModal,
      publishCaption,
      publishCategory,
      isCapturing,
      generatedImages,
      isGenerating,
    },
    setters: {
      setShowDetailModal,
      setShowPublishModal,
      setShowShareModal,
      setPublishCaption,
      setPublishCategory,
    },
    refs: { shareCardRef, shareCardTransparentRef },
    derived: { stats, groupedRoutines, sortedCompleted, hasLogs },
    handlers: {
      handleClearAll,
      toggleEditMode,
      handleDeleteLog,
      formatTime,
      handleLogPress,
      handlePublish,
      confirmPublish,
      handleShare,
      handleCopyImage,
      handleShareToPlatform,
    },
  } = useLogData();

  return (
    <ScreenWrapper style={screenStyles.container}>
      {/* Header */}
      <View style={screenStyles.pageHeader}>
        <View style={[screenStyles.pageHeaderContent, { marginBottom: theme.spacing.sm }]}>
          <Text style={screenStyles.pageTitle}>Log</Text>
          {hasLogs && (
            <TouchableOpacity
              style={screenStyles.addButton}
              onPress={handleClearAll}
              accessibilityRole="button"
              accessibilityLabel="Clear all workout logs"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={theme.iconSize.lg} color={theme.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {sortedCompleted.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No completed routines yet"
          description="Complete a routine from the Home screen to see it here."
        />
      ) : (
        <ScrollView 
          contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing['2xl'], paddingBottom: theme.spacing['4xl'] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Statistics Cards */}
          <View style={logStyles.statsContainer}>
            <View style={logStyles.statCard}>
              <Ionicons name="checkmark-circle" size={14} color={theme.iconSecondary} />
              <Text style={logStyles.statValue}>{stats.totalWorkouts}</Text>
              <Text style={logStyles.statLabel}>Workouts</Text>
            </View>

            <View style={logStyles.statCard}>
              <Ionicons name="barbell" size={14} color={theme.iconSecondary} />
              <Text style={logStyles.statValue}>{stats.totalRounds}</Text>
              <Text style={logStyles.statLabel}>Rounds</Text>
            </View>

            <View style={logStyles.statCard}>
              <Ionicons name="time" size={14} color={theme.iconSecondary} />
              <Text style={logStyles.statValue}>{stats.totalTime}</Text>
              <Text style={logStyles.statLabel}>Time</Text>
            </View>
          </View>

          {/* Grouped Routine List */}
          {Object.entries(groupedRoutines).map(([groupKey, routines]) => (
            <View key={groupKey} style={logStyles.sectionContainer}>
              <Text style={logStyles.sectionTitle}>
                {groupKey}
              </Text>
              
              {routines.map((completed, index) => {
            // Prefer the wall-clock duration (recorded when the workout
            // ended) and fall back to the planned duration for older entries.
            const totalDuration =
              typeof completed.actualDurationSec === 'number' && completed.actualDurationSec >= 0
                ? completed.actualDurationSec
                : completed.rounds * (completed.workSec + completed.restSec);
            const minutes = Math.floor(totalDuration / 60);
            const seconds = totalDuration % 60;
                const durationLabel = minutes > 0 
                  ? `${minutes}m ${seconds}s`
                  : `${seconds}s`;

            return (
                  <TouchableOpacity
                    key={`${completed.id}-${completed.completedAt}-${index}`}
                    activeOpacity={0.7}
                    onPress={() => handleLogPress(completed)}
                    style={logStyles.logCard}
                  >
                    <View style={logStyles.logCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={logStyles.logCardTitle}>
                          {completed.name}
                        </Text>
                        <View style={logStyles.logCardMeta}>
                          <View style={logStyles.logCardMetaItem}>
                            <Ionicons name="calendar-outline" size={12} color={theme.iconSecondary} />
                            <Text style={logStyles.logCardMetaText}>
                              {formatDate(completed.completedAt)}
                            </Text>
                          </View>
                          <Text style={logStyles.logCardMetaDivider}>•</Text>
                          <Text style={logStyles.logCardMetaText}>
                            {formatTime(completed)}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isEditMode && (
                          <TouchableOpacity
                            onPress={() => handleDeleteLog(completed)}
                            style={logStyles.deleteButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete log entry for ${completed?.name || 'routine'}`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="trash-outline" size={theme.iconSize.md} color={theme.error} />
                          </TouchableOpacity>
                        )}
                        <View style={logStyles.logCardIcon}>
                          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                        </View>
                      </View>
                    </View>

                    <View style={logStyles.logCardBadges}>
                      <View style={logStyles.logBadge}>
                        <Ionicons name="barbell-outline" size={12} color={theme.iconSecondary} />
                        <Text style={logStyles.logBadgeText}>
                          {completed.rounds} {completed.rounds === 1 ? 'round' : 'rounds'}
                        </Text>
                      </View>
                      
                      <View style={logStyles.logBadge}>
                        <Ionicons name="flash-outline" size={12} color={theme.iconSecondary} />
                        <Text style={logStyles.logBadgeText}>
                          {completed.workSec}s work
                        </Text>
                      </View>
                      
                      {completed.restSec > 0 && (
                        <View style={logStyles.logBadge}>
                          <Ionicons name="time-outline" size={12} color={theme.iconSecondary} />
                          <Text style={logStyles.logBadgeText}>
                            {completed.restSec}s rest
                          </Text>
                        </View>
                      )}
                      
                      <View style={logStyles.logBadge}>
                        <Ionicons name="hourglass-outline" size={12} color={theme.iconSecondary} />
                        <Text style={logStyles.logBadgeText}>
                          {durationLabel}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: theme.modalOverlay,
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: theme.modalBackground,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: theme.spacing['2xl'],
            paddingBottom: theme.spacing['4xl'],
            maxHeight: '90%',
          }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: theme.spacing.xl,
              marginBottom: theme.spacing['2xl'],
            }}>
              <Text style={{
                fontSize: theme.fontSize['2xl'],
                fontWeight: theme.fontWeight.bold,
                color: theme.text,
              }}>
                Workout Details
              </Text>
              <TouchableOpacity
                onPress={() => setShowDetailModal(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.cardSecondary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: theme.spacing.xl }}
                showsVerticalScrollIndicator={false}
              >
                <View style={{
                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#f0f9ff',
                  borderRadius: 16,
                  padding: theme.spacing.xl,
                  marginBottom: theme.spacing['2xl'],
                }}>
                  <Text style={{
                    fontSize: theme.fontSize['3xl'],
                    fontWeight: theme.fontWeight.bold,
                    color: theme.text,
                    marginBottom: theme.spacing.sm,
                  }}>
                    {selectedLog.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                      <Ionicons name="calendar-outline" size={16} color={theme.iconSecondary} />
                      <Text style={{ color: theme.textSecondary, fontSize: theme.fontSize.base }}>
                        {formatDate(selectedLog.completedAt)}
                      </Text>
                    </View>
                    <Text style={{ color: theme.borderDark, fontSize: theme.fontSize.sm }}>•</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: theme.fontSize.base }}>
                      {formatTime(selectedLog)}
                    </Text>
                  </View>
                  
                  {selectedLog.description && (
                    <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 22 }}>
                      {selectedLog.description}
                    </Text>
                  )}
                </View>

                <View style={{
                  flexDirection: 'row',
                  gap: theme.spacing.md,
                  marginBottom: theme.spacing['2xl'],
                }}>
                  <View style={{
                    flex: 1,
                    backgroundColor: theme.cardSecondary,
                    borderRadius: 12,
                    padding: theme.spacing.lg,
                    alignItems: 'center',
                  }}>
                    <Ionicons name="barbell" size={24} color={theme.buttonPrimary} />
                    <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginTop: theme.spacing.sm }}>
                      {selectedLog.rounds}
                    </Text>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary, marginTop: theme.spacing.xs }}>
                      Rounds
                    </Text>
                  </View>

                  <View style={{
                    flex: 1,
                    backgroundColor: theme.cardSecondary,
                    borderRadius: 12,
                    padding: theme.spacing.lg,
                    alignItems: 'center',
                  }}>
                    <Ionicons name="flash" size={24} color={theme.warning} />
                    <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginTop: theme.spacing.sm }}>
                      {selectedLog.workSec}s
                    </Text>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary, marginTop: theme.spacing.xs }}>
                      Work Time
                    </Text>
                  </View>

                  <View style={{
                    flex: 1,
                    backgroundColor: theme.cardSecondary,
                    borderRadius: 12,
                    padding: theme.spacing.lg,
                    alignItems: 'center',
                  }}>
                    <Ionicons name="time" size={24} color={theme.success} />
                    <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginTop: theme.spacing.sm }}>
                      {selectedLog.restSec}s
                    </Text>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary, marginTop: theme.spacing.xs }}>
                      Rest Time
                    </Text>
                  </View>
                </View>

                {selectedLog.roundsData && selectedLog.roundsData.length > 0 && (
                  <View style={{ marginBottom: theme.spacing['2xl'] }}>
                    <Text style={{
                      fontSize: theme.fontSize.lg,
                      fontWeight: theme.fontWeight.bold,
                      color: theme.text,
                      marginBottom: theme.spacing.md,
                    }}>
                      Round Details
                    </Text>
                    {selectedLog.roundsData.map((round, idx) => (
                      <View
                        key={idx}
                        style={{
                          backgroundColor: theme.cardSecondary,
                          borderRadius: 12,
                          padding: theme.spacing.md,
                          marginBottom: theme.spacing.sm,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
                          Round {round.roundNumber || idx + 1}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                          <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary }}>
                            {round.workSec}s work
                          </Text>
                          {round.restSec > 0 && (
                            <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary }}>
                              {round.restSec}s rest
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
                  <TouchableOpacity
                    onPress={handlePublish}
                    style={{
                      flex: 1,
                      backgroundColor: theme.buttonPrimary,
                      borderRadius: 12,
                      padding: theme.spacing.lg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Ionicons name="share-social" size={20} color={theme.buttonText} />
                    <Text style={{
                      color: theme.buttonText,
                      fontSize: theme.fontSize.md,
                      fontWeight: theme.fontWeight.semibold,
                    }}>
                      Publish
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleShare}
                    style={{
                      flex: 1,
                      backgroundColor: theme.accent,
                      borderRadius: 12,
                      padding: theme.spacing.lg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Ionicons name="share-outline" size={20} color={theme.textInverse} />
                    <Text style={{
                      color: theme.textInverse,
                      fontSize: theme.fontSize.md,
                      fontWeight: theme.fontWeight.semibold,
                    }}>
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Publish Modal */}
      <Modal
        visible={showPublishModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPublishModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: theme.modalOverlay,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.xl,
        }}>
          <View style={{
            backgroundColor: theme.modalBackground,
            borderRadius: 20,
            padding: theme.spacing['2xl'],
            width: '100%',
            maxWidth: 400,
          }}>
            <Text style={{
              fontSize: theme.fontSize['2xl'],
              fontWeight: theme.fontWeight.bold,
              color: theme.text,
              marginBottom: theme.spacing.xl,
            }}>
              Publish Workout
            </Text>

            <Text style={{
              fontSize: theme.fontSize.base,
              color: theme.textSecondary,
              marginBottom: theme.spacing.md,
            }}>
              Category
            </Text>
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.xl,
            }}>
              {['sport', 'study', 'learn', 'mindfulness'].map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setPublishCategory(cat)}
                  style={{
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                    borderRadius: 8,
                    backgroundColor: publishCategory === cat ? theme.buttonPrimary : theme.cardSecondary,
                  }}
                >
                  <Text style={{
                    color: publishCategory === cat ? theme.buttonText : theme.text,
                    fontSize: theme.fontSize.base,
                    fontWeight: theme.fontWeight.semibold,
                    textTransform: 'capitalize',
                  }}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{
              fontSize: theme.fontSize.base,
              color: theme.textSecondary,
              marginBottom: theme.spacing.sm,
            }}>
              Caption (optional)
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.inputBorder,
                borderRadius: 12,
                padding: theme.spacing.md,
                fontSize: 15,
                color: theme.inputText,
                backgroundColor: theme.inputBackground,
                minHeight: 100,
                textAlignVertical: 'top',
                marginBottom: theme.spacing.xl,
              }}
              placeholder="Share your thoughts about this workout..."
              placeholderTextColor={theme.inputPlaceholder}
              multiline
              value={publishCaption}
              onChangeText={setPublishCaption}
            />

            <View style={{
              flexDirection: 'row',
              gap: theme.spacing.md,
            }}>
              <TouchableOpacity
                onPress={() => {
                  setShowPublishModal(false);
                  setPublishCaption('');
                }}
                style={{
                  flex: 1,
                  padding: theme.spacing.lg,
                  borderRadius: 12,
                  backgroundColor: theme.cardSecondary,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: theme.text,
                  fontSize: theme.fontSize.md,
                  fontWeight: theme.fontWeight.semibold,
                }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmPublish}
                style={{
                  flex: 1,
                  padding: theme.spacing.lg,
                  borderRadius: 12,
                  backgroundColor: theme.buttonPrimary,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: theme.buttonText,
                  fontSize: theme.fontSize.md,
                  fontWeight: theme.fontWeight.semibold,
                }}>
                  Publish
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <Modal
        visible={showShareModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShareModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <TouchableOpacity
            onPress={() => setShowShareModal(false)}
            style={{
              position: 'absolute',
              top: 50,
              right: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          
          <View style={{
            width: '100%',
            maxWidth: 400,
            maxHeight: '90%',
          }}>

            {isGenerating ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: theme.spacing['4xl'] }}>
                <ActivityIndicator size="large" color={theme.textInverse} />
                <Text style={{ marginTop: theme.spacing.lg, fontSize: theme.fontSize.md, color: theme.textInverse, fontWeight: theme.fontWeight.medium }}>
                  Generating images...
                </Text>
              </View>
            ) : generatedImages.full && generatedImages.transparent ? (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xl }}
                showsVerticalScrollIndicator={false}
              >
                {/* Image Preview Section */}
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 32 }}
                  contentContainerStyle={{ paddingHorizontal: 0 }}
                >
                  {/* Full Image - Instagram Post Style */}
                  <View style={{
                    width: Platform.OS === 'ios' ? 350 : 320,
                    marginRight: theme.spacing.xl,
                    alignItems: 'center',
                  }}>
                    <Text style={{
                      color: theme.textInverse,
                      fontSize: theme.fontSize.md,
                      fontWeight: theme.fontWeight.semibold,
                      marginBottom: theme.spacing.lg,
                      textAlign: 'center',
                    }}>
                      Instagram Post
                    </Text>
                    <View style={{
                      width: '100%',
                      height: 400,
                      borderRadius: 16,
                      backgroundColor: theme.card,
                      ...theme.shadow.lg,
                      overflow: 'hidden',
                    }}>
                      <Image
                        source={{ uri: generatedImages.full }}
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  </View>

                  {/* Transparent Image - Reels Style */}
                  <View style={{
                    width: Platform.OS === 'ios' ? 350 : 320,
                    alignItems: 'center',
                  }}>
                    <Text style={{
                      color: theme.textInverse,
                      fontSize: theme.fontSize.md,
                      fontWeight: theme.fontWeight.semibold,
                      marginBottom: theme.spacing.lg,
                      textAlign: 'center',
                    }}>
                      Reels / Stories
                    </Text>
                    <View style={{
                      width: '100%',
                      height: 400,
                      borderRadius: 16,
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      borderWidth: 2,
                      borderColor: 'rgba(255, 255, 255, 0.3)',
                      borderStyle: 'dashed',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}>
                      <Image
                        source={{ uri: generatedImages.transparent }}
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                </ScrollView>

                {/* Share to Section */}
                <Text style={{
                  color: theme.textInverse,
                  fontSize: theme.fontSize.lg,
                  fontWeight: theme.fontWeight.bold,
                  marginBottom: theme.spacing.xl,
                  textAlign: 'center',
                }}>
                  Share to
                </Text>

                <View style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 16,
                  justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  {/* Instagram Story */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('instagram-story')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: '#E4405F',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <Ionicons name="logo-instagram" size={32} color="#ffffff" />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>Story</Text>
                  </TouchableOpacity>

                  {/* Instagram Messages */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('instagram-messages')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: '#E4405F',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: theme.spacing.sm,
                    }}>
                      <Ionicons name="chatbubble" size={28} color={theme.textInverse} />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>Messages</Text>
                  </TouchableOpacity>

                  {/* WhatsApp */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('whatsapp')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: '#25D366',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: theme.spacing.sm,
                    }}>
                      <Ionicons name="logo-whatsapp" size={32} color={theme.textInverse} />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>WhatsApp</Text>
                  </TouchableOpacity>

                  {/* Facebook */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('facebook')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: '#1877F2',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: theme.spacing.sm,
                    }}>
                      <Ionicons name="logo-facebook" size={32} color={theme.textInverse} />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>Facebook</Text>
                  </TouchableOpacity>

                  {/* Message */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('message')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: '#34C759',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: theme.spacing.sm,
                    }}>
                      <Ionicons name="chatbubble-ellipses" size={28} color={theme.textInverse} />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>Message</Text>
                  </TouchableOpacity>

                  {/* More (Native Share) */}
                  <TouchableOpacity
                    onPress={() => handleShareToPlatform('native')}
                    disabled={isCapturing}
                    style={{
                      width: 70,
                      alignItems: 'center',
                      opacity: isCapturing ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 70,
                      height: 70,
                      borderRadius: 35,
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: theme.spacing.sm,
                    }}>
                      <Ionicons name="ellipsis-horizontal" size={28} color={theme.textInverse} />
                    </View>
                    <Text style={{ fontSize: theme.fontSize.sm, color: theme.textInverse, textAlign: 'center' }}>More</Text>
                  </TouchableOpacity>
                </View>

                {isCapturing && (
                  <View style={{
                    alignItems: 'center',
                    padding: theme.spacing.lg,
                  }}>
                    <ActivityIndicator size="small" color={theme.textInverse} />
                    <Text style={{ fontSize: theme.fontSize.base, color: theme.textInverse, marginTop: theme.spacing.sm }}>
                      Preparing image...
                    </Text>
                  </View>
                )}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Hidden Shareable Cards - For Image Capture */}
      {selectedLog && (
        <>
          {/* Full Card with Background - Instagram Post Style */}
          <View style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0 }}>
            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1.0 }}>
              <View style={{
                width: 1080,
                height: 1350,
                overflow: 'hidden',
              }}>
                {/* Dynamic Background Gradient */}
                <LinearGradient
                  colors={['#4A90E2', '#5BA3F5', '#87CEEB', '#FFD89B', '#FFB347']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                  }}
                />
                
                {/* Stylized Route Path */}
                <Svg
                  width="1080"
                  height="1350"
                  style={{ position: 'absolute' }}
                >
                  <Path
                    d="M 100 400 Q 200 300, 300 350 T 500 400 T 700 450 T 900 500 T 980 550"
                    stroke="#ffffff"
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.4"
                  />
                  <Path
                    d="M 100 500 Q 250 400, 400 450 T 600 500 T 800 550 T 980 600"
                    stroke="#ffffff"
                    strokeWidth="10"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.3"
                  />
                  <Circle cx="100" cy="400" r="8" fill="#ffffff" opacity="0.6" />
                  <Circle cx="980" cy="550" r="8" fill="#ffffff" opacity="0.6" />
                </Svg>

                {/* Content */}
                <View style={{
                  flex: 1,
                  padding: theme.spacing['4xl'],
                  justifyContent: 'space-between',
                }}>
                  {/* Top Section - Branding */}
                  <View>
                    <Text style={{
                      fontSize: 32,
                      fontWeight: '800',
                      color: '#ffffff',
                      letterSpacing: 2,
                      marginBottom: 8,
                    }}>
                      SYNCAPP
                    </Text>
                    <Text style={{
                      fontSize: 18,
                      color: 'rgba(255, 255, 255, 0.9)',
                      fontWeight: '500',
                    }}>
                      {formatDate(selectedLog.completedAt)} at {formatTime(selectedLog)}
                    </Text>
                  </View>

                  {/* Main Stats - Bold and Large */}
                  <View style={{
                    marginTop: 60,
                  }}>
                    {/* Primary Metric */}
                    <View style={{
                      marginBottom: 50,
                    }}>
                      <Text style={{
                        fontSize: 140,
                        fontWeight: '900',
                        color: '#ffffff',
                        letterSpacing: -4,
                        lineHeight: 140,
                      }}>
                        {selectedLog.rounds}
                      </Text>
                      <Text style={{
                        fontSize: 32,
                        color: 'rgba(255, 255, 255, 0.95)',
                        fontWeight: '700',
                        marginTop: 8,
                        letterSpacing: 1,
                      }}>
                        ROUNDS
                      </Text>
                    </View>

                    {/* Secondary Metrics */}
                    <View style={{
                      flexDirection: 'row',
                      gap: 60,
                      marginTop: 40,
                    }}>
                      <View>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          gap: 8,
                        }}>
                          <Text style={{
                            fontSize: 72,
                            fontWeight: '900',
                            color: '#ffffff',
                            letterSpacing: -2,
                          }}>
                            {selectedLog.workSec}
                          </Text>
                          <Text style={{
                            fontSize: 36,
                            fontWeight: '700',
                            color: 'rgba(255, 255, 255, 0.9)',
                          }}>
                            s
                          </Text>
                        </View>
                        <Text style={{
                          fontSize: 20,
                          color: 'rgba(255, 255, 255, 0.85)',
                          fontWeight: '600',
                          marginTop: 8,
                          letterSpacing: 0.5,
                        }}>
                          WORK
                        </Text>
                      </View>

                      <View>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          gap: 8,
                        }}>
                          <Text style={{
                            fontSize: 72,
                            fontWeight: '900',
                            color: '#ffffff',
                            letterSpacing: -2,
                          }}>
                            {selectedLog.restSec}
                          </Text>
                          <Text style={{
                            fontSize: 36,
                            fontWeight: '700',
                            color: 'rgba(255, 255, 255, 0.9)',
                          }}>
                            s
                          </Text>
                        </View>
                        <Text style={{
                          fontSize: 20,
                          color: 'rgba(255, 255, 255, 0.85)',
                          fontWeight: '600',
                          marginTop: 8,
                          letterSpacing: 0.5,
                        }}>
                          REST
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Bottom Section - Workout Name */}
                  <View>
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 16,
                      marginBottom: 12,
                    }}>
                      <Ionicons name="barbell" size={32} color="#ffffff" />
                      <Text style={{
                        fontSize: 36,
                        fontWeight: '800',
                        color: '#ffffff',
                        letterSpacing: -1,
                      }}>
                        {selectedLog.name.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 18,
                      color: 'rgba(255, 255, 255, 0.8)',
                      fontWeight: '500',
                    }}>
                      Workout Completed
                    </Text>
                  </View>
                </View>
              </View>
            </ViewShot>
          </View>

          {/* Transparent Card - Reels Style */}
          <View style={{ position: 'absolute', left: -9999, top: -9999, opacity: 0 }}>
            <ViewShot ref={shareCardTransparentRef} options={{ format: 'png', quality: 1.0, backgroundColor: 'transparent' }}>
              <View style={{
                width: 1080,
                height: 1350,
                backgroundColor: 'transparent',
                padding: 80,
                justifyContent: 'center',
              }}>
                {/* Stylized Route Path - More Prominent */}
                <Svg
                  width="1080"
                  height="1350"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                >
                  <Path
                    d="M 150 300 Q 300 200, 450 250 T 600 300 T 750 350 T 930 400"
                    stroke={isDark ? '#ffffff' : '#1f2937'}
                    strokeWidth="16"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                  <Path
                    d="M 150 400 Q 350 300, 550 350 T 750 400 T 930 450"
                    stroke={isDark ? '#ffffff' : '#1f2937'}
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.5"
                  />
                  <Circle cx="150" cy="300" r="12" fill={isDark ? '#ffffff' : '#1f2937'} opacity="0.9" />
                  <Circle cx="930" cy="400" r="12" fill={isDark ? '#ffffff' : '#1f2937'} opacity="0.9" />
                </Svg>

                <View style={{
                  backgroundColor: 'transparent',
                  padding: theme.spacing['3xl'],
                }}>
                  {/* Top Branding */}
                  <View style={{
                    marginBottom: 60,
                  }}>
                    <Text style={{
                      fontSize: 28,
                      fontWeight: '800',
                      color: isDark ? '#ffffff' : '#1f2937',
                      letterSpacing: 2,
                      marginBottom: 8,
                    }}>
                      SYNCAPP
                    </Text>
                    <Text style={{
                      fontSize: 16,
                      color: isDark ? '#d1d5db' : '#6b7280',
                      fontWeight: '500',
                    }}>
                      {formatDate(selectedLog.completedAt)} • {formatTime(selectedLog)}
                    </Text>
                  </View>

                  {/* Bold Stats */}
                  <View style={{
                    marginBottom: 50,
                  }}>
                    {/* Primary Metric */}
                    <View style={{
                      marginBottom: 40,
                    }}>
                      <Text style={{
                        fontSize: 120,
                        fontWeight: '900',
                        color: isDark ? '#ffffff' : '#1f2937',
                        letterSpacing: -3,
                        lineHeight: 120,
                      }}>
                        {selectedLog.rounds}
                      </Text>
                      <Text style={{
                        fontSize: 28,
                        color: isDark ? '#d1d5db' : '#6b7280',
                        fontWeight: '700',
                        marginTop: 8,
                        letterSpacing: 1,
                      }}>
                        ROUNDS
                      </Text>
                    </View>

                    {/* Secondary Metrics */}
                    <View style={{
                      flexDirection: 'row',
                      gap: 50,
                    }}>
                      <View>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          gap: 6,
                        }}>
                          <Text style={{
                            fontSize: 64,
                            fontWeight: '900',
                            color: isDark ? '#ffffff' : '#1f2937',
                            letterSpacing: -2,
                          }}>
                            {selectedLog.workSec}
                          </Text>
                          <Text style={{
                            fontSize: 32,
                            fontWeight: '700',
                            color: isDark ? '#d1d5db' : '#6b7280',
                          }}>
                            s
                          </Text>
                        </View>
                        <Text style={{
                          fontSize: 18,
                          color: isDark ? '#d1d5db' : '#6b7280',
                          fontWeight: '600',
                          marginTop: 6,
                          letterSpacing: 0.5,
                        }}>
                          WORK
                        </Text>
                      </View>

                      <View>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          gap: 6,
                        }}>
                          <Text style={{
                            fontSize: 64,
                            fontWeight: '900',
                            color: isDark ? '#ffffff' : '#1f2937',
                            letterSpacing: -2,
                          }}>
                            {selectedLog.restSec}
                          </Text>
                          <Text style={{
                            fontSize: 32,
                            fontWeight: '700',
                            color: isDark ? '#d1d5db' : '#6b7280',
                          }}>
                            s
                          </Text>
                        </View>
                        <Text style={{
                          fontSize: 18,
                          color: isDark ? '#d1d5db' : '#6b7280',
                          fontWeight: '600',
                          marginTop: 6,
                          letterSpacing: 0.5,
                        }}>
                          REST
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Workout Name */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                  }}>
                    <Ionicons name="barbell" size={28} color={isDark ? '#ffffff' : '#1f2937'} />
                    <Text style={{
                      fontSize: 32,
                      fontWeight: '800',
                      color: isDark ? '#ffffff' : '#1f2937',
                      letterSpacing: -0.5,
                    }}>
                      {selectedLog.name.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            </ViewShot>
          </View>
        </>
      )}
    </ScreenWrapper>
  );
}

const createLogStyles = (themeWithIsDark) => {
  const { isDark, ...theme } = themeWithIsDark;
  return StyleSheet.create({
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonActive: {
    backgroundColor: theme.buttonPrimary,
  },
  editButtonDisabled: {
    opacity: 0.5,
  },
  clearAllButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing['4xl'],
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing['2xl'],
  },
  emptyStateTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
    color: theme.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: theme.fontSize.base,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.xs,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  statValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.bold,
    color: theme.text,
    marginTop: theme.spacing.xs,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.textTertiary,
  },
  sectionContainer: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.xs,
  },
  logCard: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.border,
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  logCardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    color: theme.text,
    marginBottom: 2,
  },
  logCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  logCardMetaText: {
    color: theme.textSecondary,
    fontSize: theme.fontSize.sm,
  },
  logCardMetaDivider: {
    color: theme.borderDark,
    fontSize: theme.fontSize.xs,
  },
  logCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logCardBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.borderLight,
  },
  logBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.cardSecondary,
    borderRadius: 6,
  },
  logBadgeText: {
    color: theme.text,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  });
};
