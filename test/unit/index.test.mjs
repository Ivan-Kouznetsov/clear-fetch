import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createClearFetch } from '../../dist/index.js';

function createTempDatabasePath(testName) {
  const dir = mkdtempSync(join(tmpdir(), 'clear-fetch-index-test-'));
  const safeName = testName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    dir,
    dbPath: join(dir, `${safeName}.sqlite`),
  };
}

function getLatestRecord(dbPath) {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const request = database
      .prepare('SELECT * FROM requests ORDER BY timestamp DESC LIMIT 1')
      .get();
    let response = null;
    if (request) {
      response = database
        .prepare('SELECT * FROM responses WHERE request_id = $id')
        .get({ $id: request.id });
    }
    return { request, response };
  } finally {
    database.close();
  }
}

test('createClearFetch defaults and option parsing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('ok');

  const tempCwdDir = mkdtempSync(join(tmpdir(), 'clear-fetch-index-default-cwd-'));
  const originalCwd = process.cwd();

  try {
    process.chdir(tempCwdDir);
    // Test default options (especially omitted databasePath and redactionKeys)
    const clearFetch = createClearFetch();
    const response = await clearFetch('https://example.com/test');
    assert.equal(response.status, 200);

    // Verify it created the default database path
    const defaultDir = join(tempCwdDir, '.clear-fetch');
    const defaultDbFile = join(defaultDir, 'clear-fetch.sqlite');
    assert.ok(existsSync(defaultDbFile));
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(originalCwd);
    try {
      rmSync(tempCwdDir, { recursive: true, force: true });
    } catch {
      // Ignore EPERM on Windows since the database file is kept open.
      // It will be cleaned up when the test process exits.
    }
  }
});

test('createClearFetch logs successful response', async () => {
  const { dir, dbPath } = createTempDatabasePath('success');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ data: 'hello' }), {
      status: 201,
      statusText: 'Created',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'yes' },
    });
  };

  try {
    const clearFetch = createClearFetch({
      databasePath: dbPath,
      redactionKeys: ['secret-key', 'secret_key'],
    });

    const response = await clearFetch('https://example.com/api/users?page=2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Secret-Key': 'password123',
      },
      body: JSON.stringify({ secret: 'foo', secret_key: 'sensitive' }),
    });

    assert.equal(response.status, 201);
    const bodyText = await response.text();
    assert.deepEqual(JSON.parse(bodyText), { data: 'hello' });

    // Assert database records
    const { request, response: loggedResponse } = getLatestRecord(dbPath);
    assert.ok(request);
    assert.ok(loggedResponse);

    assert.equal(request.method, 'POST');
    assert.equal(request.url, 'https://example.com/api/users?page=2');
    assert.equal(request.protocol, 'https:');
    assert.equal(request.host, 'example.com');
    assert.equal(request.path, '/api/users');
    assert.equal(request.query_params, JSON.stringify({ page: '2' }));

    const reqHeaders = JSON.parse(request.headers);
    assert.equal(reqHeaders['content-type'], 'application/json');
    assert.equal(reqHeaders['secret-key'], '[REDACTED]');

    const reqBody = JSON.parse(request.body);
    assert.deepEqual(reqBody, { secret: '[REDACTED]', secret_key: '[REDACTED]' });

    assert.equal(loggedResponse.status, 201);
    assert.equal(loggedResponse.status_text, 'Created');
    assert.equal(loggedResponse.error, null);
    assert.ok(loggedResponse.duration_ms >= 0);
  } finally {
    globalThis.fetch = originalFetch;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test('createClearFetch logs error details when fetch throws (Error object with stack)', async () => {
  const { dir, dbPath } = createTempDatabasePath('error-stack');
  const originalFetch = globalThis.fetch;

  const simulatedError = new Error('DNS resolution failed');
  globalThis.fetch = async () => {
    throw simulatedError;
  };

  try {
    const clearFetch = createClearFetch({ databasePath: dbPath });

    await assert.rejects(
      () => clearFetch('https://invalid-domain.local/'),
      /DNS resolution failed/,
    );

    const { request, response: loggedResponse } = getLatestRecord(dbPath);
    assert.ok(request);
    assert.ok(loggedResponse);
    assert.equal(loggedResponse.status, null);
    assert.equal(loggedResponse.error, simulatedError.stack);
  } finally {
    globalThis.fetch = originalFetch;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test('createClearFetch logs error details when fetch throws (Error object without stack)', async () => {
  const { dir, dbPath } = createTempDatabasePath('error-no-stack');
  const originalFetch = globalThis.fetch;

  const simulatedError = new Error('No stack error');
  delete simulatedError.stack;
  globalThis.fetch = async () => {
    throw simulatedError;
  };

  try {
    const clearFetch = createClearFetch({ databasePath: dbPath });

    await assert.rejects(() => clearFetch('https://invalid-domain.local/'), /No stack error/);

    const { request, response: loggedResponse } = getLatestRecord(dbPath);
    assert.ok(request);
    assert.ok(loggedResponse);
    assert.equal(loggedResponse.error, 'No stack error');
  } finally {
    globalThis.fetch = originalFetch;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test('createClearFetch logs error details when fetch throws (primitive error)', async () => {
  const { dir, dbPath } = createTempDatabasePath('error-primitive');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw 'Simulated network exception';
  };

  try {
    const clearFetch = createClearFetch({ databasePath: dbPath });

    await assert.rejects(
      () => clearFetch('https://invalid-domain.local/'),
      /Simulated network exception/,
    );

    const { request, response: loggedResponse } = getLatestRecord(dbPath);
    assert.ok(request);
    assert.ok(loggedResponse);
    assert.equal(loggedResponse.error, 'Simulated network exception');
  } finally {
    globalThis.fetch = originalFetch;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test('createClearFetch captures and logs the caller function name correctly', async () => {
  const { dir, dbPath } = createTempDatabasePath('caller-function');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response('ok');

  try {
    const clearFetch = createClearFetch({ databasePath: dbPath });

    async function testCallerFunction() {
      return await clearFetch('https://example.com/caller-test');
    }

    await testCallerFunction();

    const { request } = getLatestRecord(dbPath);
    assert.ok(request);
    assert.match(String(request.caller_file), /index\.test\.mjs$/);
    assert.equal(request.caller_function, 'testCallerFunction');
    assert.equal(typeof request.caller_line, 'number');
    assert.ok(request.caller_line > 0);
  } finally {
    globalThis.fetch = originalFetch;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});
