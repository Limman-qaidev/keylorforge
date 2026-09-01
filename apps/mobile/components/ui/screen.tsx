import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from './tokens';

type ScreenProps = PropsWithChildren<{ scroll?: boolean; testID?: string }>;

export function Screen({ children, scroll = false, testID }: ScreenProps) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.flex}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { backgroundColor: colors.canvas, flex: 1 },
  content: { flex: 1, padding: spacing.xl },
  scroll: { flexGrow: 1, padding: spacing.xl },
});
