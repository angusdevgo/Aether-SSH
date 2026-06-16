import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRemotePath, canCopyRemotePath } from './fileManagerPaths.js';

test('buildRemotePath joins root paths without duplicate slashes', () => {
  assert.equal(buildRemotePath('/', 'etc'), '/etc');
});

test('buildRemotePath joins nested paths', () => {
  assert.equal(buildRemotePath('/var/log', 'syslog'), '/var/log/syslog');
});

test('canCopyRemotePath only enables copying for a concrete item', () => {
  assert.equal(canCopyRemotePath(null), false);
  assert.equal(canCopyRemotePath({ name: 'tmp', isDirectory: true }), true);
});
