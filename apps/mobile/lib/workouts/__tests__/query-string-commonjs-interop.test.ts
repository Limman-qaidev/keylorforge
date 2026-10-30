/**
 * The Expo Router navigation stack uses CJS query-string@7.
 * Verify the audited URI decoder still satisfies its callable CJS interface.
 * A Jest transform-only fix would mask this real runtime compatibility issue.
 */
declare const require: (name: string) => any;

const queryString = require('query-string') as {
  parse: (input: string) => Record<string, string | string[] | null>;
  stringify: (input: Record<string, string | string[]>) => string;
};
const decodeComponent = require('decode-uri-component') as (input: string) => string;

describe('secure CommonJS URI decoder used by Expo Router', () => {
  it('exports a callable function and correctly handles valid and malformed Unicode', () => {
    expect(typeof decodeComponent).toBe('function');
    expect(decodeComponent('m%C3%BAsculo')).toBe('músculo');
    expect(decodeComponent('%zz')).toBe('%zz');
  });

  it('preserves query-string@7 parsing and stringifying with UTF-8 and repeated keys', () => {
    const parsed = queryString.parse('exercise=press%20banca&name=m%C3%BAsculo&set=1&set=2');
    expect(parsed.exercise).toBe('press banca');
    expect(parsed.name).toBe('músculo');
    expect(parsed.set).toEqual(['1', '2']);
    expect(queryString.stringify({ exercise: 'press banca' })).toBe('exercise=press%20banca');
  });

  it('does not throw when decoding invalid percent escapes through query-string', () => {
    expect(queryString.parse('bad=%zz').bad).toBe('%zz');
  });
});
