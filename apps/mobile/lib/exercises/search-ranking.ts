/**
 * Deterministic, accent-insensitive ranking of the public canonical catalogue.
 * A typo affects discovery only: results keep their original canonical IDs.
 */
import type { ExerciseListItem } from './catalog-api';

export function normalizeExerciseQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Optimal string alignment distance, bounded at 2 edits for safety. */
function distanceWithinTwo(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const rows: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = distance;
    }
  }
  return rows[a.length]![b.length]!;
}

/**
 * Exact > prefix > substring > minor edit distance.
 * Very short queries never trigger fuzzy matches.
 */
function rank(query: string, candidate: string): number | null {
  if (!query) return 0;
  if (query === candidate) return 0;
  if (candidate.startsWith(query)) return 1;
  if (candidate.includes(query)) return 2;
  if (query.length < 4) return null;
  const words = candidate.split(' ');
  const candidates = [...words];
  if (query.includes(' '))
    candidates.push(candidate.slice(0, query.length + 2));
  const limit = query.length >= 7 ? 2 : 1;
  let best = 3;
  for (const word of candidates) {
    const distance = distanceWithinTwo(query, word);
    if (distance < best) best = distance;
  }
  return best <= limit ? 2 + best : null;
}

export function rankExerciseMatches(
  items: readonly ExerciseListItem[],
  rawQuery: string,
): ExerciseListItem[] {
  const query = normalizeExerciseQuery(rawQuery);
  if (!query) return [...items];
  return items
    .map((item) => ({
      item,
      name: normalizeExerciseQuery(item.name),
    }))
    .map(({ item, name }) => ({ item, name, score: rank(query, name) }))
    .filter(
      (
        entry,
      ): entry is { item: ExerciseListItem; name: string; score: number } =>
        entry.score !== null,
    )
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.name.localeCompare(b.name, 'es') ||
        a.item.id.localeCompare(b.item.id),
    )
    .map(({ item }) => item);
}
