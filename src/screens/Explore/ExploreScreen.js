import Surface from '../../components/common/Surface';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePostContext } from '../../context/PostContext';
import { useRoutineContext } from '../../context/RoutineContext';
import { useTheme } from '../../context/ThemeContext';
import ScreenWrapper from '../../components/common/ScreenWrapper';
import ScreenHeader from '../../components/common/ScreenHeader';
import Sheet from '../../components/common/Sheet';
import { EmptyState } from '../../components/common/StateViews';
import { normalizeRoutine } from '../../domain/routines';
import { formatTime } from '../../utils/timeFormatters';
import DiscoverAdSlot from './components/DiscoverAdSlot';
import DiscoverRoutineCard from './components/DiscoverRoutineCard';

const categories = ['all', 'sport', 'learn', 'study', 'mindfulness'];
export default function ExploreScreen({ navigation } = {}) {
  const { posts, upvotePost, downvotePost } = usePostContext();
  const { addRoutine, routines, saveOwner } = useRoutineContext();
  const saveLifetime = useRef({ active: true, owner: saveOwner });
  if (saveLifetime.current.owner !== saveOwner)
    saveLifetime.current = { active: true, owner: saveOwner };
  const savingPosts = useRef(new Set());
  useEffect(() => {
    saveLifetime.current.active = true;
    return () => {
      saveLifetime.current.active = false;
    };
  }, []);
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const feed = useRef(null);
  useEffect(() => {
    feed.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query, category]);
  const visiblePosts = useMemo(
    () =>
      posts.filter(
        (post) =>
          (category === 'all' || post.category === category) &&
          [post.routine?.name, post.caption, post.authorName].some((value) =>
            value?.toLowerCase().includes(query.trim().toLowerCase()),
          ),
      ),
    [posts, query, category],
  );
  const isSaved = (post) => routines.some((r) => r.sourcePostId === post.id);
  const save = async (post) => {
    if (isSaved(post) || savingPosts.current.has(post.id)) return;
    const lifetime = saveLifetime.current;
    const current = () =>
      saveLifetime.current === lifetime && lifetime.active && navigation?.isFocused?.() !== false;
    if (!current()) return;
    savingPosts.current.add(post.id);
    // Session metadata belongs to history, not to a new reusable routine.
    const {
      sessionId,
      startedAt,
      completedAt,
      actualDurationSec,
      status,
      roundsCompleted,
      totalRounds,
      skippedPhases,
      ...template
    } = post.routine;
    try {
      const saved = await addRoutine(
        { ...template, id: `saved-${Date.now()}`, sourcePostId: post.id },
        { isCurrent: current },
      );
      if (!current()) return;
      if (saved === false) throw new Error('Could not save this routine. Please try again.');
      Alert.alert('Routine saved', 'You can find it in Training and open it in Timer.');
    } catch (error) {
      if (current()) Alert.alert('Could not save routine', error?.message || 'Please try again.');
    } finally {
      savingPosts.current.delete(post.id);
    }
  };
  const selectedRoutine = selected ? normalizeRoutine(selected.routine) : null;
  return (
    <ScreenWrapper>
      <ScreenHeader
        title="Discover"
        icon={searchOpen ? 'close' : 'search-outline'}
        actionLabel={searchOpen ? 'Close search' : 'Search Discover'}
        onAction={() => {
          setSearchOpen(!searchOpen);
          if (searchOpen) setQuery('');
        }}
      />
      <View style={styles.top}>
        {searchOpen && (
          <Surface variant="inset" style={styles.search}>
            <Ionicons name="search" size={19} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Find a routine"
              placeholderTextColor={theme.textTertiary}
              style={{ flex: 1, color: theme.text, fontSize: 15 }}
              accessibilityLabel="Search routines"
              clearButtonMode="while-editing"
            />
          </Surface>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
        >
          {categories.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              accessibilityRole="button"
              accessibilityState={{ selected: c === category }}
              style={[
                styles.chip,
                { borderBottomColor: c === category ? theme.accent : 'transparent' },
              ]}
            >
              <Text
                style={{
                  color: c === category ? theme.text : theme.textSecondary,
                  fontSize: 14,
                  fontWeight: c === category ? '600' : '400',
                  textTransform: 'capitalize',
                }}
              >
                {c === 'all' ? 'All' : c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={styles.adPlacement}>
        <DiscoverAdSlot
          visible={!searchOpen && !query.trim() && visiblePosts.length > 0}
          hasBlockingModal={!!selected}
        />
      </View>
      <FlatList
        ref={feed}
        data={visiblePosts}
        keyExtractor={(post) => post.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="No routines found"
            description="Try another category or search."
          />
        }
        renderItem={({ item: post }) => (
          <DiscoverRoutineCard
            post={post}
            saved={isSaved(post)}
            onOpen={() => setSelected(post)}
            onSave={() => save(post)}
            onUpvote={() => upvotePost(post.id)}
            onDownvote={() => downvotePost(post.id)}
          />
        )}
      />
      <Sheet
        visible={!!selected}
        title={selectedRoutine?.name || 'Routine'}
        onClose={() => setSelected(null)}
      >
        <ScrollView>
          {selectedRoutine && (
            <>
              {!!(selected?.caption || selectedRoutine.description) && (
                <Text style={{ color: theme.textSecondary, lineHeight: 21, marginBottom: 12 }}>
                  {selected?.caption || selectedRoutine.description}
                </Text>
              )}
              {selectedRoutine.countdownBeforeStartDuration > 0 && (
                <Text style={{ color: theme.textSecondary, marginBottom: 14 }}>
                  {selectedRoutine.countdownBeforeStartDuration}s preparation
                </Text>
              )}
              {selectedRoutine.roundsData.map((round, index) => (
                <View key={index} style={[styles.round, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.text, fontWeight: '600' }}>Round {index + 1}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 13, marginTop: 6 }}>
                    {formatTime(round.workSec)} work
                    {index < selectedRoutine.rounds - 1
                      ? ` · ${formatTime(round.restSec)} rest`
                      : ''}
                  </Text>
                  {[round.workSong, round.restSong].filter(Boolean).map((song, i) => (
                    <Text key={i} style={{ color: theme.accent, fontSize: 12, marginTop: 6 }}>
                      {song.name || song.title || 'Attached audio'}
                    </Text>
                  ))}
                </View>
              ))}
              <Pressable
                onPress={() => save(selected)}
                disabled={isSaved(selected)}
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaved(selected) }}
                style={[
                  styles.primary,
                  { backgroundColor: isSaved(selected) ? theme.cardSecondary : theme.accent },
                ]}
              >
                <Text
                  style={{
                    color: isSaved(selected) ? theme.textSecondary : theme.accentText,
                    fontWeight: '600',
                  }}
                >
                  {isSaved(selected) ? 'Saved to Training' : 'Save to Training'}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Sheet>
    </ScreenWrapper>
  );
}
const styles = StyleSheet.create({
  top: { paddingHorizontal: 20 },
  adPlacement: { paddingHorizontal: 20 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    height: 44,
    marginBottom: 10,
    gap: 10,
    borderRadius: 16,
  },
  categories: { flexDirection: 'row', gap: 24, paddingBottom: 0 },
  chip: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, paddingBottom: 8 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  round: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  primary: { alignItems: 'center', padding: 18, borderRadius: 16, marginTop: 22 },
});
