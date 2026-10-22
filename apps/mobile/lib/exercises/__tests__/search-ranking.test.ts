import type { ExerciseListItem } from '../catalog-api';
import { normalizeExerciseQuery, rankExerciseMatches } from '../search-ranking';

const item = (id: string, name: string): ExerciseListItem => ({
  id,
  name,
  measurement_type: 'reps',
  difficulty_level: null,
  category: null,
  primary_muscles: [],
  equipment: [],
});

describe('canonical exercise discovery', () => {
  const catalogue = [
    item('1', 'Sentadilla con barra'),
    item('2', 'Curl de bíceps'),
    item('3', 'Press de banca'),
    item('4', 'Sentadilla frontal'),
  ];

  it('normalizes case, accent, whitespace and punctuation', () => {
    expect(normalizeExerciseQuery('  BÍCEPS  ')).toBe('biceps');
    expect(normalizeExerciseQuery('Curl--de   bíceps')).toBe('curl de biceps');
    expect(rankExerciseMatches(catalogue, 'biceps').map((v) => v.id)).toEqual([
      '2',
    ]);
  });

  it('recovers one-letter omissions and ranks exact prefixes before typos', () => {
    expect(
      rankExerciseMatches(catalogue, 'sentadila').map((v) => v.id),
    ).toEqual(['1', '4']);
    expect(
      rankExerciseMatches(catalogue, 'sentadilla').map((v) => v.id),
    ).toEqual(['1', '4']);
  });

  it('avoids broad fuzzy matches for short queries and preserves canonical IDs', () => {
    expect(rankExerciseMatches(catalogue, 'zz').length).toBe(0);
    const found = rankExerciseMatches(catalogue, 'Press');
    expect(found[0]?.id).toBe('3');
    expect(found[0]?.name).toBe('Press de banca');
  });
});
