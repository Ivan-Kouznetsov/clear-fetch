import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createClearFetch } from '../dist/index.js';
import { initGlobalClearFetch } from '../dist/init.js';
import { openClearFetchDatabase } from '../dist/db.js';
import { startLocalServer, startMockServer } from './util/server.mjs';

let server;

before(async () => {
  server = await startMockServer();
});

after(async () => {
  if (server) {
    await server.close();
  }
});

function createTempDatabasePath(testName) {
  const dir = mkdtempSync(join(tmpdir(), 'clear-fetch-test-'));
  const safeName = testName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return join(dir, `${safeName}.sqlite`);
}

function getLatestRequestAndResponse(databasePath, expectedUrlPrefix) {
  const database = new DatabaseSync(databasePath, { readOnly: true });

  try {
    const row = database
      .prepare(
        `
        SELECT
          req.url as url,
          req.method as method,
          req.headers as request_headers,
          req.body as request_body,
          req.caller_file as caller_file,
          req.caller_line as caller_line,
          req.caller_function as caller_function,
          res.status as status,
          res.headers as response_headers,
          res.body as response_body,
          res.error as error,
          res.duration_ms as duration_ms
        FROM requests req
        INNER JOIN responses res ON res.request_id = req.id
        WHERE req.url LIKE $urlPrefix
        ORDER BY req.timestamp DESC
        LIMIT 1
      `,
      )

      .get({ $urlPrefix: `${expectedUrlPrefix}%` });

    assert.ok(row, `Missing request/response row for URL prefix: ${expectedUrlPrefix}`);
    return row;
  } finally {
    database.close();
  }
}

test('GET /posts', async () => {
  const databasePath = createTempDatabasePath('jsonplaceholder-posts');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/posts`);
  assert.equal(response.status, 200);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/posts`);
  assert.equal(row.status, 200);
  assert.equal(row.method, 'GET');
  assert.match(String(row.caller_file), /integration\.real-http\.test\.mjs$/);
  assert.equal(typeof row.caller_line, 'number');
  assert.ok(row.caller_line > 0);
});

test('GET /posts/1', async () => {
  const databasePath = createTempDatabasePath('jsonplaceholder-posts-1');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/posts/1`);
  assert.equal(response.status, 200);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/posts/1`);
  assert.equal(row.status, 200);
});

test('GET /comments?postId=1', async () => {
  const databasePath = createTempDatabasePath('jsonplaceholder-comments-postid-1');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/comments?postId=1`);
  assert.equal(response.status, 200);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/comments?postId=1`);
  assert.equal(row.status, 200);
});

test('GET /users', async () => {
  const databasePath = createTempDatabasePath('jsonplaceholder-users');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/users`);
  assert.equal(response.status, 200);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/users`);
  assert.equal(row.status, 200);
});

test('GET /status/404', async () => {
  const databasePath = createTempDatabasePath('jsonplaceholder-404');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/status/404`);
  assert.equal(response.status, 404);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/status/404`);
  assert.equal(row.status, 404);
});

test('GET /status/500', async () => {
  const databasePath = createTempDatabasePath('httpbin-status-500');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/status/500`);
  assert.equal(response.status, 500);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/status/500`);
  assert.equal(row.status, 500);
});

test('GET /status/502', async () => {
  const databasePath = createTempDatabasePath('httpbin-status-502');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/status/502`);
  assert.equal(response.status, 502);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/status/502`);
  assert.equal(row.status, 502);
});

test('GET /status/503', async () => {
  const databasePath = createTempDatabasePath('httpbin-status-503');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/status/503`);
  assert.equal(response.status, 503);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/status/503`);
  assert.equal(row.status, 503);
});

test('GET /delay/3 with timeout abort', async () => {
  const databasePath = createTempDatabasePath('httpbin-delay-3-timeout');
  const clearFetch = createClearFetch({ databasePath });

  await assert.rejects(
    () =>
      clearFetch(`${server.url}/delay/3`, {
        signal: AbortSignal.timeout(1000),
        headers: {
          Authorization: 'Bearer should-not-appear',
          'X-Api-Key': 'top-secret-api-key',
          Cookie:
            'sessionid=abc123; jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.1234567890.abcdefghijk',
        },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      return true;
    },
  );

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/delay/3`);
  assert.equal(row.status, null);
  assert.equal(typeof row.error, 'string');
  assert.ok(row.error.length > 0);
  assert.match(String(row.caller_file), /integration\.real-http\.test\.mjs$/);
  assert.equal(typeof row.caller_line, 'number');
  assert.ok(row.caller_line > 0);

  const headers = JSON.parse(row.request_headers);
  assert.equal(headers.authorization, '[REDACTED]');
  assert.equal(headers['x-api-key'], '[REDACTED]');
  assert.equal(headers.cookie, '[REDACTED]');
});

test('GET /bytes/1024 logs hashed binary response body', async () => {
  const databasePath = createTempDatabasePath('httpbin-bytes-1024');
  const clearFetch = createClearFetch({ databasePath });

  const response = await clearFetch(`${server.url}/bytes/1024`);
  assert.equal(response.status, 200);

  const row = getLatestRequestAndResponse(databasePath, `${server.url}/bytes/1024`);
  assert.equal(row.status, 200);
  assert.equal(typeof row.response_body, 'string');
  assert.match(String(row.response_body), /^\[Binary File\] SHA-256: [a-f0-9]{64}$/);
});

test('createClearFetch defaults and option parsing', async () => {
  const tempCwdDir = mkdtempSync(join(tmpdir(), 'clear-fetch-integration-default-cwd-'));
  const originalCwd = process.cwd();

  const defaultPath = join(tempCwdDir, '.clear-fetch', 'clear-fetch.sqlite');

  process.chdir(tempCwdDir);

  const clearFetch = createClearFetch();

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  try {
    const response = await clearFetch(server.url, {
      headers: {
        Authorization: 'Bearer test-token',
        'X-Normal-Header': 'normal-value',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'ok');

    const row = getLatestRequestAndResponse(defaultPath, 'http://127.0.0.1');
    assert.equal(row.status, 200);
    const headers = JSON.parse(row.request_headers);
    assert.equal(headers.authorization, '[REDACTED]');
    assert.equal(headers['x-normal-header'], 'normal-value');
  } finally {
    await server.close();
    process.chdir(originalCwd);
    try {
      rmSync(tempCwdDir, { recursive: true, force: true });
    } catch {
      // Ignore EPERM on Windows since the database file is kept open.
      // It will be cleaned up when the test process exits.
    }
  }
});

test('createClearFetch with custom redaction keys and headers/body redaction', async () => {
  const databasePath = createTempDatabasePath('custom-redaction');
  const clearFetch = createClearFetch({
    databasePath,
    redactionKeys: ['X-Custom-Secret', 'sensitiveField'],
  });

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        safeField: 'safe-response',
        sensitiveField: 'secret-response',
      }),
    );
  });

  try {
    const response = await clearFetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Secret': 'my-custom-secret-value',
        'X-Safe-Header': 'safe-header-value',
      },
      body: JSON.stringify({
        safeField: 'safe-request',
        sensitiveField: 'secret-request',
      }),
    });
    assert.equal(response.status, 200);
    const bodyText = await response.text();
    const bodyJson = JSON.parse(bodyText);
    assert.equal(bodyJson.safeField, 'safe-response');
    assert.equal(bodyJson.sensitiveField, 'secret-response');
  } finally {
    await server.close();
  }

  const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
  assert.equal(row.status, 200);

  const reqHeaders = JSON.parse(row.request_headers);
  assert.equal(reqHeaders['x-custom-secret'], '[REDACTED]');
  assert.equal(reqHeaders['x-safe-header'], 'safe-header-value');

  const reqBody = JSON.parse(row.request_body);
  assert.equal(reqBody.safeField, 'safe-request');
  assert.equal(reqBody.sensitiveField, '[REDACTED]');

  const resBody = JSON.parse(row.response_body);
  assert.equal(resBody.safeField, 'safe-response');
  assert.equal(resBody.sensitiveField, '[REDACTED]');
});

test('PUT and DELETE requests log correct method and details', async () => {
  const databasePath = createTempDatabasePath('put-delete-methods');
  const clearFetch = createClearFetch({ databasePath });

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`${req.method} response`);
  });

  try {
    const putRes = await clearFetch(server.url, { method: 'PUT' });
    assert.equal(putRes.status, 200);
    assert.equal(await putRes.text(), 'PUT response');
    const putRow = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
    assert.equal(putRow.method, 'PUT');

    const delRes = await clearFetch(server.url, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(await delRes.text(), 'DELETE response');
    const delRow = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
    assert.equal(delRow.method, 'DELETE');
  } finally {
    await server.close();
  }
});

test('POST binary request body logs hashed request body', async () => {
  const databasePath = createTempDatabasePath('binary-request');
  const clearFetch = createClearFetch({ databasePath });

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  try {
    const binaryData = Buffer.from('hello binary world');
    const response = await clearFetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: binaryData,
    });
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }

  const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
  assert.equal(row.status, 200);
  assert.equal(typeof row.request_body, 'string');
  assert.match(row.request_body, /^\[Binary File\] SHA-256: [a-f0-9]{64}$/);
});

test('Multiple Set-Cookie headers are normalized and redacted', async () => {
  const databasePath = createTempDatabasePath('set-cookies');
  const clearFetch = createClearFetch({ databasePath });

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Set-Cookie': ['cookie1=value1; Path=/', 'cookie2=value2; Domain=example.com'],
    });
    res.end('ok');
  });

  try {
    const response = await clearFetch(server.url);
    assert.equal(response.status, 200);
  } finally {
    await server.close();
  }

  const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
  assert.equal(row.status, 200);

  const resHeaders = JSON.parse(row.response_headers || '{}');
  assert.equal(resHeaders['set-cookie'], '[REDACTED]');
});

test('Request or response with missing content-type is handled gracefully', async () => {
  const databasePath = createTempDatabasePath('missing-content-type');
  const clearFetch = createClearFetch({ databasePath });

  const server = await startLocalServer((req, res) => {
    res.end('no content type response');
  });

  try {
    const response = await clearFetch(server.url, {
      method: 'POST',
      body: 'no content type request body',
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'no content type response');
  } finally {
    await server.close();
  }

  const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
  assert.equal(row.status, 200);
  assert.equal(row.request_body, 'no content type request body');
  assert.equal(row.response_body, 'no content type response');
});

test('Invalid JSON payload falls back to raw text logging', async () => {
  const databasePath = createTempDatabasePath('invalid-json');
  const clearFetch = createClearFetch({ databasePath });

  const server = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"validJson": false, "missingQuote: 123}');
  });

  try {
    const response = await clearFetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalidJson": true,',
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"validJson": false, "missingQuote: 123}');
  } finally {
    await server.close();
  }

  const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
  assert.equal(row.status, 200);
  assert.equal(row.request_body, '{"invalidJson": true,');
  assert.equal(row.response_body, '{"validJson": false, "missingQuote: 123}');
});

test('initGlobalClearFetch bootstrap integrates and logs global fetch calls', async () => {
  const originalFetch = globalThis.fetch;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDebug = process.env.DEBUG;

  const databasePath = createTempDatabasePath('global-bootstrap');

  try {
    // 1. NODE_ENV = 'production': Should not patch
    process.env.NODE_ENV = 'production';
    process.env.DEBUG = '1';
    initGlobalClearFetch({ databasePath });
    assert.equal(
      globalThis.fetch,
      originalFetch,
      'globalThis.fetch should not be patched in production',
    );

    // Restore fetch reference
    globalThis.fetch = originalFetch;

    // 2. DEBUG not '1': Should not patch
    process.env.NODE_ENV = 'development';
    delete process.env.DEBUG;
    initGlobalClearFetch({ databasePath });
    assert.equal(
      globalThis.fetch,
      originalFetch,
      'globalThis.fetch should not be patched when DEBUG !== 1',
    );

    // Restore fetch reference
    globalThis.fetch = originalFetch;

    // 3. NODE_ENV = 'development' and DEBUG = '1': Should patch and work
    process.env.NODE_ENV = 'development';
    process.env.DEBUG = '1';

    initGlobalClearFetch({ databasePath });

    assert.notEqual(globalThis.fetch, originalFetch, 'globalThis.fetch should be patched');

    const server = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('global fetch ok');
    });

    try {
      const response = await globalThis.fetch(server.url);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'global fetch ok');
    } finally {
      await server.close();
    }

    const row = getLatestRequestAndResponse(databasePath, 'http://127.0.0.1');
    assert.equal(row.status, 200);
    assert.equal(row.response_body, 'global fetch ok');
  } finally {
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

test('openClearFetchDatabase with custom path can be closed', () => {
  const databasePath = createTempDatabasePath('db-close-test');
  const database = openClearFetchDatabase(databasePath);

  database.close();

  assert.throws(() => {
    database.insertRequest({
      id: 'any-id',
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: 'http://example.com',
      protocol: 'http:',
      host: 'example.com',
      path: '/',
      queryParams: '{}',
      headers: '{}',
      body: null,
      callerFile: null,
      callerLine: null,
      callerFunction: null,
    });
  });
});
