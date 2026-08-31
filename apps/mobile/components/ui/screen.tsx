import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/components/ui/tokens';

type ScreenProps = PropsWithChildren<{ centered?: boolean }>;

export function Screen({ centered = false, children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.content, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
        style={styles.screen}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: 'center' },
  content: { padding: spacing.xl },
  inner: { width: '100%' },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  screen: { backgroundColor: colors.background, flex: 1 },
});
