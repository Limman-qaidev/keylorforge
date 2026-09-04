import { StyleSheet, Text, View } from 'react-native';

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
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <View style={styles.accent} />
      <Text style={styles.message}>{message}</Text>
      <Text style={styles.note}>
        Esta sección todavía no contiene datos ni funciones de entrenamiento.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  accent: {
    backgroundColor: '#00afa1',
    borderRadius: 3,
    height: 5,
    marginTop: 18,
    width: 54,
  },
  container: {
    backgroundColor: '#f7f9fc',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  eyebrow: {
    color: '#007f76',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  message: {
    color: '#344054',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 20,
    maxWidth: 420,
  },
  note: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 420,
  },
  title: {
    color: '#101828',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
});
