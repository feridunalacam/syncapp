import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import notices from '../../data/openSourceNotices.json';
import Sheet from './Sheet';

const libraries = notices.notices
  .flatMap((notice) => notice.components.map((name) => ({ name, notice })))
  .sort((a, b) => a.name.localeCompare(b.name));

export default function OpenSourceNotices({ visible, onClose }) {
  const { theme } = useTheme();
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setQuery('');
    }
  }, [visible]);
  if (!visible) return null;
  const filtered = libraries.filter(({ name }) => name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Sheet visible={visible} title="Open-source notices" onClose={onClose}>
      {selected ? (
        <>
          <Pressable
            onPress={() => setSelected(null)}
            accessibilityRole="button"
            style={styles.back}
          >
            <Text style={{ color: theme.accent }}>All libraries</Text>
          </Pressable>
          <ScrollView style={styles.scroll}>
            <Text selectable style={[styles.title, { color: theme.text }]}>
              {selected.name}
            </Text>
            <Text selectable style={[styles.license, { color: theme.textSecondary }]}>
              {selected.notice.text}
            </Text>
          </ScrollView>
        </>
      ) : (
        <>
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Licenses and acknowledgements for software and icon artwork used by Sync. Available
            offline.
          </Text>
          <TextInput
            accessibilityLabel="Search libraries"
            placeholder="Search libraries"
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.search, { color: theme.text, backgroundColor: theme.inputBackground }]}
          />
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {filtered.map((library) => (
              <Pressable
                key={`${library.name}:${library.notice.id}`}
                onPress={() => setSelected(library)}
                accessibilityRole="button"
                style={[styles.row, { borderBottomColor: theme.border }]}
              >
                <Text style={[styles.name, { color: theme.text }]}>{library.name}</Text>
              </Pressable>
            ))}
            {!filtered.length && (
              <Text style={[styles.intro, { color: theme.textSecondary }]}>
                No matching libraries.
              </Text>
            )}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 16 },
  search: { borderRadius: 14, padding: 13, fontSize: 15, marginBottom: 8 },
  row: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 14, lineHeight: 21 },
  title: { fontSize: 17, fontWeight: '600', lineHeight: 25, marginBottom: 16 },
  license: { fontSize: 13, lineHeight: 20, paddingBottom: 16 },
  back: { paddingVertical: 10, marginBottom: 10, alignSelf: 'flex-start' },
});
