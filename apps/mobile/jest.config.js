// Preserve jest-expo's Expo/React Native transform exceptions and extend them
// for decode-uri-component 0.5.1, which ships ESM and is loaded by query-string.
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.includes('standard-navigation')
      ? pattern.replace(
          'standard-navigation',
          'standard-navigation|decode-uri-component',
        )
      : pattern,
  ),
};
