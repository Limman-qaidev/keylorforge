/**
 * QA release only: enable cleartext traffic ONLY to 127.0.0.1 via adb reverse.
 * The app config adds this plugin exclusively for the distinct .qareal ID.
 * Main production and diagnostic variants NEVER receive this policy.
 */
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

const PACKAGE = 'com.jonathansalgadonieto.keylorforge.qareal';
const NAME = 'keylorforge_qa_loopback_network';

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

module.exports = function withQaLoopbackCleartext(config) {
  if (config.android?.package !== PACKAGE ||
      config.extra?.m3RealQaWorkoutEnabled !== true) {
    throw new Error('Local cleartext networking must be confined to QA Real Android.');
  }

  config = withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) throw new Error('QA Android manifest has no application element.');
    if (app.$['android:networkSecurityConfig']) {
      throw new Error('QA network security policy must not override an existing policy.');
    }
    app.$['android:networkSecurityConfig'] = '@xml/' + NAME;
    return mod;
  });

  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dest = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await mkdir(dest, { recursive: true });
      await writeFile(path.join(dest, NAME + '.xml'), XML, { flag: 'w' });
      return mod;
    },
  ]);
};
