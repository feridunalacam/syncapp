import Surface from '../../../components/common/Surface';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { normalizeRoutine, getRoutineDuration } from '../../../domain/routines';
import { formatTime } from '../../../utils/timeFormatters';
import IntervalPreview from '../../../components/common/IntervalPreview';

export default function DiscoverRoutineCard({ post, saved, onOpen, onSave, onUpvote, onDownvote }) {
  const { theme } = useTheme();
  const routine = normalizeRoutine(post.routine);
  const variedWork = routine.roundsData.some((r) => r.workSec !== routine.roundsData[0]?.workSec);
  const rests = routine.roundsData.slice(0, -1);
  const variedRest = rests.some((r) => r.restSec !== rests[0]?.restSec);
  return (
    <Surface
      variant="card"
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <View style={styles.heading}>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`View ${routine.name}`}
          style={{ flex: 1 }}
        >
          <Text style={[styles.category, { color: theme.textSecondary }]}>
            {post.category || 'Routine'}
          </Text>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {routine.name}
          </Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saved}
          accessibilityRole="button"
          accessibilityLabel={saved ? `${routine.name} saved` : `Save ${routine.name}`}
          accessibilityState={{ disabled: saved }}
          style={[
            styles.bookmark,
            { backgroundColor: saved ? theme.accentLight : theme.background },
          ]}
        >
          <Ionicons
            name={saved ? 'checkmark' : 'bookmark-outline'}
            size={21}
            color={saved ? theme.accent : theme.text}
          />
        </Pressable>
      </View>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Preview ${routine.name}`}
      >
        <View style={styles.metrics}>
          <View style={{ flex: 1.35 }}>
            <Text style={[styles.duration, { color: theme.text }]}>
              {formatTime(getRoutineDuration(routine))}
            </Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>
              {routine.rounds} rounds · total
            </Text>
          </View>
          <View style={[styles.metric, { borderColor: theme.border }]}>
            <Text style={[styles.value, { color: theme.text }]}>
              {variedWork ? 'Varies' : formatTime(routine.roundsData[0]?.workSec || 0)}
            </Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Work</Text>
          </View>
          <View style={[styles.metric, { borderColor: theme.border }]}>
            <Text style={[styles.value, { color: theme.text }]}>
              {variedRest ? 'Varies' : formatTime(rests[0]?.restSec || 0)}
            </Text>
            <Text style={[styles.label, { color: theme.textSecondary }]}>Rest</Text>
          </View>
        </View>
        <IntervalPreview routine={routine} height={7} />
      </Pressable>
      <View style={[styles.footer, { borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.background }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '700' }}>
            {(post.authorName || 'S').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 12, fontWeight: '500' }}>
            {post.authorName || 'You'}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 3 }}>
            {post.authorId === 'current-user' ? 'On this device' : 'Sample routine'}
          </Text>
        </View>
        <View style={styles.votes}>
          <Pressable
            onPress={onUpvote}
            accessibilityRole="button"
            accessibilityLabel={`Upvote ${routine.name}`}
            accessibilityState={{ selected: post.userVote === 1 }}
            style={styles.vote}
          >
            <Ionicons
              name="arrow-up"
              size={17}
              color={post.userVote === 1 ? theme.accent : theme.textSecondary}
            />
          </Pressable>
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {(post.upvotes || 0) - (post.downvotes || 0)}
          </Text>
          <Pressable
            onPress={onDownvote}
            accessibilityRole="button"
            accessibilityLabel={`Downvote ${routine.name}`}
            accessibilityState={{ selected: post.userVote === -1 }}
            style={styles.vote}
          >
            <Ionicons
              name="arrow-down"
              size={17}
              color={post.userVote === -1 ? theme.accent : theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 20,
    paddingBottom: 9,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  category: {
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 7,
  },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.65, lineHeight: 27 },
  bookmark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metrics: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 18 },
  duration: { fontSize: 32, fontWeight: '500', letterSpacing: -1.3, fontVariant: ['tabular-nums'] },
  metric: { flex: 0.85, paddingLeft: 17, borderLeftWidth: StyleSheet.hairlineWidth },
  value: { fontSize: 17, fontWeight: '500', fontVariant: ['tabular-nums'] },
  label: { fontSize: 11, marginTop: 5 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 15,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  votes: { flexDirection: 'row', alignItems: 'center' },
  vote: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
});
