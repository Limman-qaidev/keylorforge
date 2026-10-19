/**
 * Package-isolated release QA variant. Opt-in only; all ordinary Expo builds
 * retain app.json unchanged, including the original Android package.
 */
module.exports = ({ config }) => {
  if (process.env.KEYLORFORGE_QA_STANDALONE !== '1') return config;

  return {
    ...config,
    name: 'KeylorForge QA Standalone',
    scheme: 'keylorforge-qa-standalone',
    android: {
      ...config.android,
      package: 'com.jonathansalgadonieto.keylorforge.qastandalone',
      intentFilters: [],
    },
  };
};
