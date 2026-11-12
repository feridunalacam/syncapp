import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getLogDuration, getLogRounds } from '../../../domain/routines';
import { formatTime } from '../../../utils/timeFormatters';

export default function SessionShareCard({ session, transparent = false }) {
  const content = (
    <View style={styles.content}>
      <Text style={styles.brand}>SYNC / MY RHYTHM</Text>
      <Text style={styles.title}>{session.name}</Text>
      <Text style={styles.time}>{formatTime(getLogDuration(session))}</Text>
      <Text style={styles.subtitle}>
        {getLogRounds(session)} round{getLogRounds(session) === 1 ? '' : 's'} completed
      </Text>
      <View style={styles.line} />
      <Text style={styles.status}>
        {session.status === 'aborted' ? 'Every moment counts.' : 'Time well spent.'}
      </Text>
      <Text style={styles.date}>
        {new Date(session.completedAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </Text>
    </View>
  );
  return transparent ? (
    <View style={styles.card}>{content}</View>
  ) : (
    <LinearGradient colors={['#123440', '#162A40', '#2E2641']} style={styles.card}>
      {content}
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  card: { width: 320, borderRadius: 28, overflow: 'hidden' },
  content: { padding: 28, minHeight: 350 },
  brand: { color: '#9DD7DA', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#FFFFFF', fontSize: 29, fontWeight: '700', marginTop: 32 },
  time: {
    color: '#FFFFFF',
    fontSize: 62,
    fontWeight: '300',
    marginTop: 26,
    fontVariant: ['tabular-nums'],
  },
  subtitle: { color: '#C6D8E2', fontSize: 14, marginTop: 5 },
  line: { height: 1, backgroundColor: '#FFFFFF30', marginVertical: 24 },
  status: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  date: { color: '#B5C9D8', fontSize: 11, marginTop: 10 },
});
