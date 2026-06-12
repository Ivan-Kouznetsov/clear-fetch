import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openClearFetchDatabase, createRandomRequestId } from '../../dist/db.js';

function getTempDir() {
  return mkdtempSync(join(tmpdir(), 'clear-fetch-db-test-'));
}

test('createRandomRequestId', () => {
  const id = createRandomRequestId();
  assert.equal(typeof id, 'string');
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('openClearFetchDatabase with custom path', () => {
  const dir = getTempDir();
  const dbPath = join(dir, 'test.sqlite');

  try {
    const handle = openClearFetchDatabase(dbPath);
    assert.ok(existsSync(dbPath), 'Database file should be created');

    const requestId = 'req-1';
    // Insert a request record
    handle.insertRequest({
      id: requestId,
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'https://example.com/api',
      protocol: 'https:',
      host: 'example.com',
      path: '/api',
      queryParams: '{}',
      headers: '{}',
      body: 'request body',
      callerFile: 'file.js',
      callerLine: 42,
      callerFunction: 'foo',
    });

    // Insert a response record
    handle.insertResponse({
      id: 'res-1',
      requestId: requestId,
      timestamp: new Date().toISOString(),
      durationMs: 150,
      status: 200,
      statusText: 'OK',
      headers: '{}',
      body: 'response body',
      error: null,
    });

    handle.close();

    // Verify insertion using SQLite directly
    const database = new DatabaseSync(dbPath, { readOnly: true });
    const reqRow = database
      .prepare('SELECT * FROM requests WHERE id = $id')
      .get({ $id: requestId });
    assert.ok(reqRow);
    assert.equal(reqRow.method, 'GET');
    assert.equal(reqRow.caller_file, 'file.js');
    assert.equal(reqRow.caller_line, 42);

    const resRow = database
      .prepare('SELECT * FROM responses WHERE request_id = $id')
      .get({ $id: requestId });
    assert.ok(resRow);
    assert.equal(resRow.status, 200);
    assert.equal(resRow.body, 'response body');

    database.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openClearFetchDatabase with default path', () => {
  // We want to test the branch where no path is provided.
  // This defaults to process.cwd()/.clear-fetch/clear-fetch.sqlite
  const defaultDir = join(process.cwd(), '.clear-fetch');
  const defaultDbFile = join(defaultDir, 'clear-fetch.sqlite');

  // Let's backup if it exists, or just ensure we clean up ours
  const existedBefore = existsSync(defaultDbFile);

  try {
    const handle = openClearFetchDatabase();
    assert.ok(existsSync(defaultDbFile), 'Default database file should be created');
    handle.close();
  } finally {
    if (!existedBefore) {
      rmSync(defaultDir, { recursive: true, force: true });
    }
  }
});
