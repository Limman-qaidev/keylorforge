/**
 * CI ONLY: generates a harmless boot smoke route in the ephemeral checkout.
 * This route is NOT committed to the product app. Never run on the PO's
 * Samsung workspace or a working tree with user changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';

if (process.env.CI !== 'true' || process.env.KEYLORFORGE_QA_STANDALONE !== '1') {
  throw new Error('Isolated standalone smoke may only prepare in opt-in CI.');
}

const file = new URL('../app/index.tsx', import.meta.url);
const original = readFileSync(file, 'utf8');
if (
  !original.includes('export default function IndexRoute()') ||
  !original.includes('SessionRestoring')
) {
  throw new Error('App entry changed; refusing to replace it in the CI checkout.');
}

writeFileSync(
  file,
  `/**
 * Ephemeral standalone native smoke entry: no login, no production outbox.
 * Uses a different applicationId, so this SQLite cannot touch existing data.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function IndexRoute() {
  const [result, setResult] = useState('Comprobando ExpoCrypto y SQLite...');
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const generated = Crypto.randomUUID();
      if (!UUID.test(generated)) throw new Error('UUID nativo inválido');
      const db = await SQLite.openDatabaseAsync('keylorforge-standalone-smoke.db');
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS probe (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      const previous = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM probe WHERE key = 'uuid'",
      );
      if (previous && !UUID.test(previous.value)) {
        throw new Error('UUID SQLite corrupto');
      }
      await db.runAsync(
        'INSERT OR IGNORE INTO probe (key, value) VALUES (?, ?)',
        'uuid',
        generated,
      );
      const persisted = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM probe WHERE key = 'uuid'",
      );
      if (!persisted || persisted.value !== (previous?.value ?? generated)) {
        throw new Error('SQLite no conserva los datos');
      }
      if (mounted) {
        setResult(
          previous
            ? 'PASS · ExpoCrypto · SQLite persistente · SIN METRO'
            : 'PASS · ExpoCrypto · SQLite inicializada · SIN METRO',
        );
      }
    })().catch((error: unknown) => {
      if (mounted) {
        setResult('FAIL · ' + (error instanceof Error ? error.message : 'error nativo'));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        KeylorForge QA Standalone
      </Text>
      <Text accessibilityRole="text" style={{ fontSize: 18 }}>
        {result}
      </Text>
      <Text style={{ marginTop: 20 }}>
        Instalación aislada: no accede a la cuenta, al historial ni al outbox de KeylorForge.
      </Text>
    </View>
  );
}
`,
);
