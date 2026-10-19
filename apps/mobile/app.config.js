/**
 * Opt-in, package-isolated Android QA builds. Neither variant overwrites the
 * original KeylorForge installation or shares its Android private storage.
 * Diagnostic smoke and real-app QA MUST NEVER use the same applicationId.
 */
module.exports = ({ config }) => {
  const smoke = process.env.KEYLORFORGE_QA_STANDALONE === '1';
  const real = process.env.KEYLORFORGE_QA_REAL === '1';
  if (smoke && real) {
    throw new Error('QA smoke and QA real variants are mutually exclusive.');
  }
  if (!smoke && !real) return config;

  return {
    ...config,
    name: real ? 'KeylorForge QA Real' : 'KeylorForge QA Standalone',
    scheme: real ? 'keylorforge-qa-real' : 'keylorforge-qa-standalone',
    android: {
      ...config.android,
      package: real
        ? 'com.jonathansalgadonieto.keylorforge.qareal'
        : 'com.jonathansalgadonieto.keylorforge.qastandalone',
      // Do not intercept the primary app's auth callback intents. A verified
      // QA account must already exist; signup/recovery deep links are not QA'd.
      intentFilters: [],
    },
  };
};
