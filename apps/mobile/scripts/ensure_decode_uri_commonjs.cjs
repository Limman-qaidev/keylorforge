/**
 * Compatibility bridge for the audited decode-uri-component@0.5.1 source.
 *
 * query-string@7 (required by expo-router) loads its decoder through require()
 * and immediately calls it as a function. The security-patched decoder now
 * ships ESM-only with a default export. npm ci installs the official tarball
 * with its pinned SRI; this postinstall changes ONLY the module wrapper.
 *
 * Refuse unknown versions/source layouts instead of silently downgrading.
 * Remove this bridge when all consumers support the ESM decoder natively.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packageDirectory = path.join(
  __dirname,
  '..',
  'node_modules',
  'decode-uri-component',
);
const packagePath = path.join(packageDirectory, 'package.json');
const indexPath = path.join(packageDirectory, 'index.js');
const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (
  metadata.name !== 'decode-uri-component' ||
  metadata.version !== '0.5.1' ||
  metadata.exports?.default !== './index.js'
) {
  throw new Error(
    'Unexpected decode-uri-component package: refusing compatibility change',
  );
}

const source = fs.readFileSync(indexPath, 'utf8');
const original = 'export default function decodeUriComponent(encodedURI) {';
const replacement =
  'module.exports = function decodeUriComponent(encodedURI) {';
const alreadyPatched =
  metadata.type === 'commonjs' && source.includes(replacement);

if (!alreadyPatched) {
  if (
    metadata.type !== 'module' ||
    source.split(original).length !== 2 ||
    !source.includes('return input.replace(multiMatcher, run => decode(run));')
  ) {
    throw new Error(
      'Unexpected decode-uri-component source: refusing compatibility change',
    );
  }

  fs.writeFileSync(indexPath, source.replace(original, replacement));
  metadata.type = 'commonjs';
  fs.writeFileSync(packagePath, JSON.stringify(metadata, null, 2) + '\n');
}

// Exercise the actual CJS consumer after the bridge is installed; Jest alone
// can hide a runtime module interop failure by transforming ESM dependencies.
const decoder = require('decode-uri-component');
const queryString = require('query-string');
assert.equal(typeof decoder, 'function');
assert.equal(decoder('m%C3%BAsculo'), 'músculo');
assert.equal(queryString.parse('name=press%20banca').name, 'press banca');
assert.equal(queryString.parse('name=m%C3%BAsculo').name, 'músculo');
assert.equal(queryString.parse('value=%zz').value, '%zz');
console.log('Secure URI decoder v0.5.1: CommonJS consumer verified');
