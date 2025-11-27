import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Alert, Animated, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePostContext } from '../../context/PostContext';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import { createScreenStyles } from '../../styles/screenStyles';
import ScreenWrapper from '../../components/common/ScreenWrapper';

// Generate initials from name
const getInitials = (name) => {
  if (!name || typeof name !== 'string') return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(' ').filter(w => w.length > 0);
  if (words.length >= 2) {
    const first = words[0][0] || '';
    const last = words[words.length - 1][0] || '';
    if (first && last) {
      return (first + last).toUpperCase();
    }
  }
  if (trimmed.length >= 2) {
    return trimmed.substring(0, 2).toUpperCase();
  }
  return trimmed.substring(0, 1).toUpperCase();
};

// Generate consistent color based on name
const getColorFromName = (name) => {
  if (!name || typeof name !== 'string') return '#06b6d4';
  
  // Color palette for avatars
  const colors = [
    '#06b6d4', // cyan
    '#ef4444', // red
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ec4899', // pink
    '#6366f1', // indigo
    '#f97316', // orange
    '#06b6d4', // cyan
    '#84cc16', // lime
    '#06b6d4', // cyan
    '#e11d48', // rose
  ];
  
  // Simple hash function to get consistent color for same name
  let hash = 0;
  const str = String(name);
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Generate background color (lighter version)
const getBackgroundColor = (name) => {
  const color = getColorFromName(name);
  // Convert hex to rgba with opacity
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.15)`;
};

// Mock spotifyTracks - this should be moved to a constants file or fetched from API
const spotifyTracks = [
  { title: 'Starboy', artist: 'The Weeknd', album: 'Starboy', duration: 230, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2734718e2b124f79258be7bc452' },
  { title: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', duration: 200, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { title: 'Save Your Tears', artist: 'The Weeknd', album: 'After Hours', duration: 215, coverUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  { title: 'Hurricane', artist: 'Kanye West', album: 'Donda', duration: 245, coverUrl: 'https://i.scdn.co/image/ab67616d0000b273b03be88f88c3d16c6d81704d' },
];

// Category Button Component with press animation
function CategoryButton({ category, isSelected, onPress }) {
  const { theme } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    onPress();
  };

  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const padding = theme.spacing.xl;
  const gap = theme.spacing.sm;
  const availableWidth = SCREEN_WIDTH - (padding * 2);
  const buttonWidth = (availableWidth - gap) / 2; // Two buttons per row with gap between them

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={{
        width: buttonWidth,
        height: buttonWidth,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: category.gradient[0],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: isSelected ? 3 : 0,
        borderColor: '#ffffff',
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale: scaleAnim }],
          width: '100%',
          height: '100%',
        }}
      >
        <LinearGradient
          colors={category.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isSelected ? 1 : 0.85,
          }}
        >
          <Ionicons 
            name={category.icon} 
            size={38} 
            color={category.iconColor} 
          />
          <Text style={{ 
            color: category.iconColor, 
            fontWeight: '700', 
            fontSize: 14,
            marginTop: 6,
            textShadowColor: 'rgba(0,0,0,0.2)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2,
          }}>
            {category.name}
          </Text>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function ExploreScreen({ navigation }) {
  const { posts, searchPosts, upvotePost, downvotePost } = usePostContext();
  const { addRoutine } = useRoutineContext();
  const { theme, isDark } = useTheme();
  const screenStyles = createScreenStyles({ ...theme, isDark });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [filteredPosts, setFilteredPosts] = useState(posts);

  const categories = [
    { 
      id: 'sport', 
      name: 'Sport', 
      icon: 'barbell-outline', 
      color: '#ef4444',
      gradient: ['#ff6b6b', '#ee5a6f', '#ff3838'], // Bright red to coral gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'learn', 
      name: 'Learn', 
      icon: 'school-outline', 
      color: '#3b82f6',
      gradient: ['#4facfe', '#00f2fe', '#00c9ff'], // Bright blue to cyan gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'study', 
      name: 'Study', 
      icon: 'book-outline', 
      color: '#06b6d4',
      gradient: ['#06b6d4', '#22d3ee', '#67e8f9'], // Cyan gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'meditation', 
      name: 'Meditation', 
      icon: 'leaf-outline', 
      color: '#10b981',
      gradient: ['#34d399', '#10b981', '#059669'], // Green gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'yoga', 
      name: 'Yoga', 
      icon: 'fitness-outline', 
      color: '#f59e0b',
      gradient: ['#fbbf24', '#f59e0b', '#d97706'], // Orange/amber gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'music', 
      name: 'Music', 
      icon: 'musical-notes-outline', 
      color: '#ec4899',
      gradient: ['#f472b6', '#ec4899', '#db2777'], // Pink gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'cooking', 
      name: 'Cooking', 
      icon: 'restaurant-outline', 
      color: '#f97316',
      gradient: ['#fb923c', '#f97316', '#ea580c'], // Orange gradient
      iconColor: '#ffffff',
    },
    { 
      id: 'art', 
      name: 'Art', 
      icon: 'color-palette-outline', 
      color: '#6366f1',
      gradient: ['#818cf8', '#6366f1', '#4f46e5'], // Indigo gradient
      iconColor: '#ffffff',
    },
  ];

  const [selectedPost, setSelectedPost] = useState(null);

  useEffect(() => {
    let results = posts;
    
    // Filter by category if selected
    if (selectedCategory) {
      results = results.filter((post) => post.category?.toLowerCase() === selectedCategory.toLowerCase());
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      results = searchPosts(searchQuery);
      // Also apply category filter if active
      if (selectedCategory) {
        results = results.filter((post) => post.category?.toLowerCase() === selectedCategory.toLowerCase());
      }
    }
    
    setFilteredPosts(results);
  }, [searchQuery, selectedCategory, posts, searchPosts]);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return `${Math.floor(diffInSeconds / 604800)}w ago`;
  };

  const handleSaveRoutine = (post) => {
    const routine = post.routine;
    
    // Preserve roundsData if it exists and is valid, otherwise create a basic structure
    let roundsData = routine.roundsData;
    if (!roundsData || !Array.isArray(roundsData) || roundsData.length === 0) {
      // Create basic roundsData structure from routine's basic fields
      const rounds = routine.rounds || 5;
      const workSec = routine.workSec || 60;
      const restSec = routine.restSec || 30;
      roundsData = Array.from({ length: rounds }, (_, i) => ({
        roundNumber: i + 1,
        originalRoundNumber: i + 1,
        workSec: workSec,
        restSec: restSec,
        workSong: null,
        restSong: null,
        workPlaylistId: null,
        restPlaylistId: null,
      }));
    }
    
    // Start with the routine object and override with explicit defaults
    // This ensures we preserve ALL fields from the routine, including any we might miss
    const routineToSave = {
      // Preserve all existing routine fields first
      ...routine,
      // Explicitly set key fields to ensure they're always present
      name: routine.name || 'Custom Routine',
      rounds: routine.rounds || 5,
      workSec: routine.workSec || 60,
      restSec: routine.restSec || 30,
      description: routine.description || '',
      // Ensure roundsData is always set (either preserved or created)
      roundsData: roundsData,
      // Music-related fields with proper defaults
      spotifyPlaylist: routine.spotifyPlaylist || null,
      workoutPlaylistId: routine.workoutPlaylistId || null,
      restPlaylistId: routine.restPlaylistId || null,
      shuffleMode: routine.shuffleMode !== undefined ? routine.shuffleMode : (routine.shuffleWorkMode !== undefined ? routine.shuffleWorkMode : false),
      shuffleWorkMode: routine.shuffleWorkMode !== undefined ? routine.shuffleWorkMode : (routine.shuffleMode !== undefined ? routine.shuffleMode : false),
      shuffleRestMode: routine.shuffleRestMode !== undefined ? routine.shuffleRestMode : false,
      restVolume: routine.restVolume !== undefined ? routine.restVolume : 50,
      restVolumeEnabled: routine.restVolumeEnabled !== undefined ? routine.restVolumeEnabled : true,
      targetDurationMin: routine.targetDurationMin || null,
      // Voice countdown settings
      voiceCountdownEnabled: routine.voiceCountdownEnabled !== undefined ? routine.voiceCountdownEnabled : false,
      countdownAtStart: routine.countdownAtStart !== undefined ? routine.countdownAtStart : true,
      countdownStartMode: routine.countdownStartMode || 'preroll',
      countdownAfterWork: routine.countdownAfterWork !== undefined ? routine.countdownAfterWork : false,
      countdownAfterRest: routine.countdownAfterRest !== undefined ? routine.countdownAfterRest : false,
      countdownDuration: routine.countdownDuration || 3,
      // Platform
      platform: routine.platform || null,
      // Completion notification settings
      completionNotificationEnabled: routine.completionNotificationEnabled !== undefined ? routine.completionNotificationEnabled : false,
      completionNotificationType: routine.completionNotificationType || 'text',
      completionNotificationText: routine.completionNotificationText || '',
      completionNotificationSound: routine.completionNotificationSound || null,
    };
    
    addRoutine(routineToSave);
    Alert.alert('Success', 'Routine added to your routines!');
  };

  const getCategoryColor = (category) => {
    const cat = categories.find(c => c.id === category?.toLowerCase());
    return cat?.color || '#6b7280';
  };

  return (
    <ScreenWrapper style={screenStyles.container}>
      {/* Search Bar */}
      <View style={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing['2xl'],
        paddingBottom: theme.spacing.lg,
        backgroundColor: theme.card,
        zIndex: 10,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.cardSecondary,
          borderRadius: 12,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.sm,
          ...theme.shadow.sm,
        }}>
          <Ionicons name="search-outline" size={20} color={theme.iconSecondary} />
          <TextInput
            style={{ flex: 1, fontSize: theme.fontSize.md, color: theme.inputText }}
            placeholder="Search routines..."
            placeholderTextColor={theme.inputPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={theme.iconTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Feed */}
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: theme.spacing['4xl'] }}
      >
        {/* Video Advertisement - Inside ScrollView so it scrolls with feed */}
        {!searchQuery && !selectedCategory && filteredPosts.length > 0 && (
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {
              // Handle video ad click
              Alert.alert('Video Ad', 'This video ad will redirect to the advertiser\'s page.');
            }}
            style={{
              width: '100%',
              height: 280,
              backgroundColor: '#000000',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Video Player - Always Playing */}
            <LinearGradient
              colors={['#1e40af', '#3b82f6', '#60a5fa']}
              style={{
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {/* Video playing placeholder - replace with actual video player */}
              <View style={{
                width: '100%',
                height: '100%',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                {/* Animated playing indicator */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <View style={{
                    width: 6,
                    height: 30,
                    backgroundColor: '#ffffff',
                    borderRadius: 3,
                    opacity: 0.8,
                  }} />
                  <View style={{
                    width: 6,
                    height: 40,
                    backgroundColor: '#ffffff',
                    borderRadius: 3,
                    opacity: 0.9,
                  }} />
                  <View style={{
                    width: 6,
                    height: 30,
                    backgroundColor: '#ffffff',
                    borderRadius: 3,
                    opacity: 0.8,
                  }} />
                  <View style={{
                    width: 6,
                    height: 35,
                    backgroundColor: '#ffffff',
                    borderRadius: 3,
                    opacity: 0.85,
                  }} />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {filteredPosts.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing['4xl'], paddingHorizontal: theme.spacing.xl }}>
            <Ionicons name="compass-outline" size={64} color={theme.borderDark} />
            <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold, color: theme.textSecondary, marginTop: theme.spacing.lg }}>
              {searchQuery || selectedCategory ? 'No routines found' : 'No shared routines yet'}
            </Text>
            <Text style={{ fontSize: theme.fontSize.base, color: theme.textTertiary, marginTop: theme.spacing.sm, textAlign: 'center' }}>
              {searchQuery || selectedCategory 
                ? 'Try a different search term or category' 
                : 'Share your first routine to get started!'}
            </Text>
          </View>
        ) : (
          <>

            {/* Feed Posts */}
            {filteredPosts.map((post, index) => (
              <View key={post.id}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedPost(post)}
                  style={{
                    backgroundColor: theme.card,
                    paddingVertical: theme.spacing.md,
                    paddingHorizontal: theme.spacing.xl,
                  }}
                >
              {/* Post Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: getBackgroundColor(post.authorName || 'Anonymous'),
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                  borderWidth: 1.5,
                  borderColor: getColorFromName(post.authorName || 'Anonymous'),
                }}>
                  <Text style={{
                    color: getColorFromName(post.authorName || 'Anonymous'),
                    fontSize: theme.fontSize.sm,
                    fontWeight: theme.fontWeight.bold,
                  }}>
                    {getInitials(post.authorName || 'Anonymous')}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
                    {post.authorName || 'Anonymous'}
                  </Text>
                  <Text style={{ fontSize: theme.fontSize.xs, color: theme.textTertiary }}>
                    {formatTimeAgo(post.createdAt)}
                  </Text>
                </View>
                {post.category && (
                  <View style={{
                    paddingHorizontal: theme.spacing.sm,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: 10,
                    backgroundColor: `${getCategoryColor(post.category)}15`,
                  }}>
                    <Text style={{ 
                      color: getCategoryColor(post.category), 
                      fontSize: 11, 
                      fontWeight: '600' 
                    }}>
                      {categories.find(c => c.id === post.category?.toLowerCase())?.name || post.category}
                    </Text>
                  </View>
                )}
              </View>

              {/* Routine Info */}
              <View style={{ marginBottom: theme.spacing.sm }}>
                <Text style={{ fontSize: 17, fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: 6 }}>
                  {post.routine.name}
                </Text>
                {post.caption && (
                  <Text style={{ fontSize: theme.fontSize.sm, color: theme.textSecondary, marginBottom: theme.spacing.sm, lineHeight: 18 }}>
                    {post.caption}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <View style={[screenStyles.badgeRow, { marginTop: 0, marginBottom: 0 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="barbell-outline" size={12} color={theme.iconPrimary} />
                      <Text style={{ color: theme.text, fontSize: theme.fontSize.sm }}>{post.routine.rounds} rounds</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="time-outline" size={12} color={theme.iconPrimary} />
                      <Text style={{ color: theme.text, fontSize: theme.fontSize.sm }}>{post.routine.workSec}s / {post.routine.restSec}s</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Post Type Badge */}
              {post.type === 'completed' && (
                <View style={{
                  alignSelf: 'flex-start',
                  backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe',
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: theme.spacing.xs,
                  borderRadius: 5,
                  marginBottom: theme.spacing.sm,
                }}>
                  <Text style={{ color: theme.info, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold }}>
                    ✓ Completed Workout
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  marginTop: 6,
                  gap: 18,
                }}
              >
                {/* Upvote/Downvote */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      upvotePost(post.id);
                    }}
                    style={{ padding: theme.spacing.xs }}
                  >
                    <Ionicons 
                      name={post.userVote === 1 ? "chevron-up" : "chevron-up-outline"} 
                      size={18} 
                      color={post.userVote === 1 ? theme.success : theme.iconSecondary} 
                    />
                  </TouchableOpacity>
                  <Text style={{ 
                    color: theme.text, 
                    fontSize: theme.fontSize.sm, 
                    fontWeight: theme.fontWeight.semibold,
                    minWidth: 20,
                    textAlign: 'center',
                  }}>
                    {(post.upvotes || 0) - (post.downvotes || 0)}
                  </Text>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      downvotePost(post.id);
                    }}
                    style={{ padding: theme.spacing.xs }}
                  >
                    <Ionicons 
                      name={post.userVote === -1 ? "chevron-down" : "chevron-down-outline"} 
                      size={18} 
                      color={post.userVote === -1 ? theme.error : theme.iconSecondary} 
                    />
                  </TouchableOpacity>
                </View>
                
                {/* Save Button */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
                  onPress={(e) => {
                    e.stopPropagation && e.stopPropagation();
                    handleSaveRoutine(post);
                  }}
                >
                  <Ionicons name="bookmark-outline" size={18} color={theme.iconSecondary} />
                  <Text style={{ color: theme.textSecondary, fontSize: theme.fontSize.sm }}>Save Routine</Text>
                </TouchableOpacity>
              </View>
                </TouchableOpacity>
                {index !== filteredPosts.length - 1 && (
                  <View
                    style={{
                      height: 0.6,
                      backgroundColor: theme.border,
                      width: '88%',
                      alignSelf: 'center',
                    }}
                  />
                )}
              </View>
          ))}
          </>
        )}

        {/* Categories - At Bottom of Feed */}
        <View style={{
          backgroundColor: theme.card,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: theme.spacing['2xl'],
          paddingBottom: theme.spacing['4xl'],
          paddingHorizontal: theme.spacing.xl,
          marginTop: 0,
        }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
            <CategoryButton
              category={{ id: 'all', name: 'All', icon: 'apps-outline', gradient: ['#667eea', '#764ba2', '#f093fb'], iconColor: '#ffffff' }}
              isSelected={selectedCategory === null}
              onPress={() => setSelectedCategory(null)}
            />
            {categories.map((category) => (
              <CategoryButton
                key={category.id}
                category={category}
                isSelected={selectedCategory === category.id}
                onPress={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Post Detail Modal */}
      <Modal
        visible={selectedPost !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedPost(null)}
      >
        <View style={{ flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: theme.modalBackground,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
          }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedPost && (
                <>
                  {/* Modal Header */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.xl, borderBottomWidth: 1, borderBottomColor: theme.borderLight }}>
                    <Text style={{ fontSize: theme.fontSize['2xl'], fontWeight: theme.fontWeight.bold, color: theme.text }}>Routine Details</Text>
                    <TouchableOpacity onPress={() => setSelectedPost(null)}>
                      <Ionicons name="close" size={28} color={theme.iconSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Post Info */}
                  <View style={{ padding: theme.spacing.xl }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.lg }}>
                      <View style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: getBackgroundColor(selectedPost.authorName || 'Anonymous'),
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: theme.spacing.md,
                        borderWidth: 2,
                        borderColor: getColorFromName(selectedPost.authorName || 'Anonymous'),
                      }}>
                        <Text style={{
                          color: getColorFromName(selectedPost.authorName || 'Anonymous'),
                          fontSize: theme.fontSize.lg,
                          fontWeight: theme.fontWeight.bold,
                        }}>
                          {getInitials(selectedPost.authorName || 'Anonymous')}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
                          {selectedPost.authorName || 'Anonymous'}
                        </Text>
                        <Text style={{ fontSize: theme.fontSize.base, color: theme.textTertiary }}>
                          {formatTimeAgo(selectedPost.createdAt)}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: theme.fontSize['3xl'], fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.md }}>
                      {selectedPost.routine.name}
                    </Text>
                    
                    {selectedPost.caption && (
                      <Text style={{ fontSize: theme.fontSize.md, color: theme.textSecondary, marginBottom: theme.spacing['2xl'], lineHeight: 24 }}>
                        {selectedPost.caption}
                      </Text>
                    )}

                    {/* Routine Details */}
                    <View style={{ backgroundColor: theme.cardSecondary, borderRadius: 16, padding: theme.spacing.xl, marginBottom: theme.spacing['2xl'] }}>
                      <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.lg }}>Routine Info</Text>
                      <View style={{ gap: theme.spacing.md }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.isDark ? 'rgba(6, 182, 212, 0.2)' : '#e0d7ff', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="barbell-outline" size={20} color={theme.accent} />
                          </View>
                          <Text style={{ fontSize: theme.fontSize.md, color: theme.text, flex: 1 }}>
                            <Text style={{ fontWeight: theme.fontWeight.semibold }}>Rounds:</Text> {selectedPost.routine.rounds}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.isDark ? 'rgba(59, 130, 246, 0.2)' : '#dbeafe', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="time-outline" size={20} color={theme.info} />
                          </View>
                          <Text style={{ fontSize: theme.fontSize.md, color: theme.text, flex: 1 }}>
                            <Text style={{ fontWeight: theme.fontWeight.semibold }}>Work:</Text> {selectedPost.routine.workSec}s
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.isDark ? 'rgba(236, 72, 153, 0.2)' : '#fce7f3', alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="pause-outline" size={20} color="#ec4899" />
                          </View>
                          <Text style={{ fontSize: theme.fontSize.md, color: theme.text, flex: 1 }}>
                            <Text style={{ fontWeight: theme.fontWeight.semibold }}>Rest:</Text> {selectedPost.routine.restSec}s
                          </Text>
                        </View>
                        {selectedPost.routine.description && (
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, marginTop: theme.spacing.xs }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="document-text-outline" size={20} color={theme.warning} />
                            </View>
                            <Text style={{ fontSize: theme.fontSize.md, color: theme.text, flex: 1, lineHeight: 22 }}>
                              <Text style={{ fontWeight: theme.fontWeight.semibold }}>Description:</Text> {selectedPost.routine.description}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Music Platform */}
                    <View style={{ marginBottom: theme.spacing['2xl'] }}>
                      <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.md }}>Music Platform</Text>
                      {selectedPost.routine.workoutPlaylistId || selectedPost.routine.spotifyPlaylist ? (
                        <View style={{ flexDirection: 'row', gap: theme.spacing.md, flexWrap: 'wrap' }}>
                          {selectedPost.routine.workoutPlaylistId && (
                            <View style={{ 
                              flexDirection: 'row', 
                              alignItems: 'center', 
                              gap: theme.spacing.sm, 
                              backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4', 
                              paddingHorizontal: theme.spacing.lg, 
                              paddingVertical: theme.spacing.md, 
                              borderRadius: 12,
                              borderWidth: 2,
                              borderColor: theme.success,
                            }}>
                              <Ionicons name="musical-notes" size={24} color={theme.success} />
                              <View>
                                <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>Workout Music</Text>
                                <Text style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: theme.success }}>Spotify</Text>
                              </View>
                            </View>
                          )}
                          {selectedPost.routine.spotifyPlaylist && (
                            <View style={{ 
                              flexDirection: 'row', 
                              alignItems: 'center', 
                              gap: theme.spacing.sm, 
                              backgroundColor: theme.isDark ? 'rgba(16, 185, 129, 0.2)' : '#f0fdf4', 
                              paddingHorizontal: theme.spacing.lg, 
                              paddingVertical: theme.spacing.md, 
                              borderRadius: 12,
                              borderWidth: 2,
                              borderColor: theme.success,
                            }}>
                              <Ionicons name="musical-notes" size={24} color={theme.success} />
                              <View>
                                <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>Playlist</Text>
                                <Text style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, color: theme.success }}>Spotify</Text>
                              </View>
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={{ 
                          backgroundColor: theme.cardSecondary, 
                          padding: theme.spacing.lg, 
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}>
                          <Text style={{ fontSize: theme.fontSize.md, color: theme.textSecondary, textAlign: 'center' }}>
                            No music platform configured
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Songs/Tracks */}
                    <View style={{ marginBottom: theme.spacing['2xl'] }}>
                      <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.text, marginBottom: theme.spacing.md }}>Songs</Text>
                      {selectedPost.routine.workoutPlaylistId || selectedPost.routine.spotifyPlaylist ? (
                        <View style={{ gap: theme.spacing.sm }}>
                          {spotifyTracks.slice(0, 5).map((track, index) => (
                            <View 
                              key={index}
                              style={{ 
                                flexDirection: 'row', 
                                alignItems: 'center', 
                                gap: theme.spacing.md, 
                                backgroundColor: theme.cardSecondary, 
                                padding: theme.spacing.md, 
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: theme.border,
                              }}
                            >
                              <View style={{ 
                                width: 50, 
                                height: 50, 
                                borderRadius: 8, 
                                backgroundColor: theme.isDark ? 'rgba(6, 182, 212, 0.2)' : '#e0d7ff', 
                                alignItems: 'center', 
                                justifyContent: 'center' 
                              }}>
                                <Ionicons name="musical-note" size={24} color={theme.accent} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, color: theme.text }}>
                                  {track.title}
                                </Text>
                                <Text style={{ fontSize: theme.fontSize.base, color: theme.textSecondary }}>
                                  {track.artist}
                                </Text>
                              </View>
                              <Text style={{ fontSize: theme.fontSize.sm, color: theme.textTertiary }}>
                                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={{ 
                          backgroundColor: theme.cardSecondary, 
                          padding: theme.spacing.lg, 
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}>
                          <Text style={{ fontSize: theme.fontSize.md, color: theme.textSecondary, textAlign: 'center' }}>
                            No songs attached
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Actions */}
                    <View style={{ flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          backgroundColor: theme.buttonPrimary,
                          paddingVertical: theme.spacing.lg,
                          borderRadius: 12,
                          alignItems: 'center',
                        }}
                        onPress={() => {
                          handleSaveRoutine(selectedPost);
                          setSelectedPost(null);
                        }}
                      >
                        <Text style={{ color: theme.buttonText, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold }}>Save Routine</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}
