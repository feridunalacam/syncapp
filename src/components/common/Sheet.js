import Surface from './Surface';
import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import GlassSurface from './GlassSurface';
export default function Sheet({ visible, title, onClose, children }) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss sheet"
        />
        <Surface variant="sheet" style={[styles.sheet, { backgroundColor: theme.modalBackground }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <Text style={{ color: theme.text, fontSize: 23, fontWeight: '700', flex: 1 }}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close sheet"
              accessibilityRole="button"
            >
              <GlassSurface interactive style={styles.close}>
                <Ionicons name="close" size={20} color={theme.text} />
              </GlassSurface>
            </Pressable>
          </View>
          {children}
        </Surface>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingBottom: 38,
    paddingTop: 10,
  },
  handle: { width: 34, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  close: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
