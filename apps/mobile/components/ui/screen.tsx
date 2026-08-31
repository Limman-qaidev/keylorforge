import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/components/ui/tokens';

type ScreenProps = PropsWithChildren<{ centered?: boolean }>;

export function Screen({ centered = false, children }: ScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={[styles.content, centered && styles.centered]}
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: 'center' },
  content: { padding: spacing.xl },
  inner: { width: '100%' },
  screen: { backgroundColor: colors.background, flex: 1 },
});
