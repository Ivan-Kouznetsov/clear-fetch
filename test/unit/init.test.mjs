import test from 'node:test';
import assert from 'node:assert/strict';

import { initGlobalClearFetch } from '../../dist/init.js';

test('initGlobalClearFetch behavior', () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDebug = process.env.DEBUG;

  try {
    // Case 1: NODE_ENV = production, DEBUG = 1
    // Should NOT patch globalThis.fetch
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = 'production';
    process.env.DEBUG = '1';
    initGlobalClearFetch({ databasePath: ':memory:' });
    assert.equal(globalThis.fetch, originalFetch, 'Should not patch fetch in production');

    // Case 2: NODE_ENV = development, DEBUG = undefined/0
    // Should NOT patch globalThis.fetch
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = 'development';
    delete process.env.DEBUG;
    initGlobalClearFetch({ databasePath: ':memory:' });
    assert.equal(globalThis.fetch, originalFetch, 'Should not patch fetch when DEBUG is not 1');

    // Case 3: NODE_ENV = development, DEBUG = 1
    // Should patch globalThis.fetch
    globalThis.fetch = originalFetch;
    process.env.NODE_ENV = 'development';
    process.env.DEBUG = '1';
    initGlobalClearFetch({ databasePath: ':memory:', redactionKeys: ['dummy-key'] });
    assert.notEqual(
      globalThis.fetch,
      originalFetch,
      'Should patch fetch when debug mode is enabled',
    );
    assert.equal(typeof globalThis.fetch, 'function', 'Patched fetch should be a function');
  } finally {
    // Restore original globals
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  }
});
