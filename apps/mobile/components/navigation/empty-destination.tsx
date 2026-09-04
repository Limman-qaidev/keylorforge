import { StyleSheet, Text, View } from 'react-native';

import { KeylorForgeG4Mark } from '@/components/brand/keylorforge-g4-mark';

type EmptyDestinationProps = {
  eyebrow: string;
  message: string;
  title: string;
};

export function EmptyDestination({
  eyebrow,
  message,
  title,
}: EmptyDestinationProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.brandMark}>
          <KeylorForgeG4Mark size={18} />
        </View>
        <Text style={styles.brand}>KEYLORFORGE</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        <View accessibilityElementsHidden style={styles.visualPlaceholder}>
          <View style={styles.placeholderIcon}>
            <Text style={styles.placeholderIconText}>▱</Text>
          </View>
          <View style={styles.placeholderLineLong} />
          <View style={styles.placeholderLineShort} />
        </View>
        <Text style={styles.note}>
          Esta sección todavía no contiene datos ni funciones de entrenamiento.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: '#12213a',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#075bff',
    borderRadius: 13,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  container: {
    backgroundColor: '#f6f8fc',
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  eyebrow: {
    color: '#075bff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  message: {
    color: '#46556d',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 370,
  },
  note: {
    color: '#66758c',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 22,
    maxWidth: 360,
  },
  placeholderIcon: {
    alignItems: 'center',
    backgroundColor: '#eaf1ff',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  placeholderIconText: {
    color: '#075bff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  placeholderLineLong: {
    backgroundColor: '#dce5f4',
    borderRadius: 4,
    height: 8,
    marginLeft: 14,
    width: 142,
  },
  placeholderLineShort: {
    backgroundColor: '#e8edf5',
    borderRadius: 4,
    height: 8,
    marginLeft: 8,
    width: 72,
  },
  visualPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e3e9f3',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 28,
    padding: 20,
  },
  title: {
    color: '#12213a',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.7,
    marginTop: 7,
  },
});
