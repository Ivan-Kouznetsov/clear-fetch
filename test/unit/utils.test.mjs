import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRedactionKeySet,
  redactDeep,
  normalizeHeaders,
  isBinaryContentType,
  readStreamAsText,
  hashReadableStream,
  serializeBodyForLog,
  serializeHeadersForLog,
  parseCallerInfo,
} from '../../dist/utils.js';

test('createRedactionKeySet', () => {
  // Test without custom keys
  const set1 = createRedactionKeySet();
  assert.ok(set1.has('authorization'));
  assert.ok(set1.has('cookie'));
  assert.ok(!set1.has('custom-key'));

  // Test with custom keys
  const set2 = createRedactionKeySet(['Custom-Key', 'another-key']);
  assert.ok(set2.has('authorization'));
  assert.ok(set2.has('custom-key'));
  assert.ok(set2.has('another-key'));
});

test('redactDeep', () => {
  const keys = new Set(['secret', 'password']);

  // Primitives and null/undefined
  assert.equal(redactDeep(null, keys), null);
  assert.equal(redactDeep(undefined, keys), undefined);
  assert.equal(redactDeep(42, keys), 42);
  assert.equal(redactDeep('hello', keys), 'hello');

  // Arrays
  const arr = ['normal', { secret: 'shh' }];
  assert.deepEqual(redactDeep(arr, keys), ['normal', { secret: '[REDACTED]' }]);

  // Nested objects
  const obj = {
    normal: 'value',
    secret: 'shh',
    nested: {
      password: '123',
      safe: true,
    },
  };
  assert.deepEqual(redactDeep(obj, keys), {
    normal: 'value',
    secret: '[REDACTED]',
    nested: {
      password: '[REDACTED]',
      safe: true,
    },
  });
});

test('normalizeHeaders', () => {
  // Case 1: Standard headers
  const h1 = new Headers();
  h1.set('content-type', 'application/json');
  h1.set('x-custom', 'value');
  const norm1 = normalizeHeaders(h1);
  assert.equal(norm1['content-type'], 'application/json');
  assert.equal(norm1['x-custom'], 'value');

  // Case 2: set-cookie without getSetCookie (or empty)
  const mockHeadersNoGetSet = {
    entries() {
      return [
        ['set-cookie', 'session=123'],
        ['content-type', 'text/plain'],
      ][Symbol.iterator]();
    },
  };
  const norm2 = normalizeHeaders(mockHeadersNoGetSet);
  assert.equal(norm2['set-cookie'], 'session=123');

  // Case 3: set-cookie with getSetCookie returning items
  const mockHeadersWithGetSet = {
    entries() {
      return [
        ['set-cookie', 'session=123'],
      ][Symbol.iterator]();
    },
    getSetCookie() {
      return ['session=123', 'theme=dark'];
    },
  };
  const norm3 = normalizeHeaders(mockHeadersWithGetSet);
  assert.deepEqual(norm3['set-cookie'], ['session=123', 'theme=dark']);

  // Case 4: set-cookie with getSetCookie returning empty array
  const mockHeadersEmptyGetSet = {
    entries() {
      return [
        ['set-cookie', 'session=123'],
      ][Symbol.iterator]();
    },
    getSetCookie() {
      return [];
    },
  };
  const norm4 = normalizeHeaders(mockHeadersEmptyGetSet);
  assert.equal(norm4['set-cookie'], 'session=123');
});

test('isBinaryContentType', () => {
  assert.equal(isBinaryContentType(null), false);
  assert.equal(isBinaryContentType(''), false);
  assert.equal(isBinaryContentType('text/plain'), false);
  assert.equal(isBinaryContentType('application/json'), false);
  assert.equal(isBinaryContentType('application/vnd.api+json'), false);
  assert.equal(isBinaryContentType('application/xml'), false);
  assert.equal(isBinaryContentType('text/html'), false);
  assert.equal(isBinaryContentType('application/javascript'), false);
  assert.equal(isBinaryContentType('application/x-www-form-urlencoded'), false);

  assert.equal(isBinaryContentType('application/octet-stream'), true);
  assert.equal(isBinaryContentType('image/png'), true);
  assert.equal(isBinaryContentType('audio/mpeg'), true);
});

test('readStreamAsText', async () => {
  // Null stream
  assert.equal(await readStreamAsText(null), '');

  // Normal stream with chunks (Uint8Array and Buffer)
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('hello '));
      controller.enqueue(Buffer.from('world'));
      controller.close();
    },
  });

  assert.equal(await readStreamAsText(stream), 'hello world');
});

test('hashReadableStream', async () => {
  // Null stream
  const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  assert.equal(await hashReadableStream(null), emptyHash);

  // Normal stream
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('hello '));
      controller.enqueue(Buffer.from('world'));
      controller.close();
    },
  });

  const expectedHash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'; // sha256 of 'hello world'
  assert.equal(await hashReadableStream(stream), expectedHash);
});

test('serializeBodyForLog', async () => {
  const keys = new Set(['secret']);

  // Case 1: Null stream
  assert.equal(await serializeBodyForLog('text/plain', null, keys), null);

  // Case 2: Binary stream
  const binaryStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('some binary data'));
      controller.close();
    },
  });
  const binaryResult = await serializeBodyForLog('application/octet-stream', binaryStream, keys);
  assert.match(binaryResult, /^\[Binary File\] SHA-256: [a-f0-9]{64}$/);

  // Case 3: Empty body
  const emptyStream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  assert.equal(await serializeBodyForLog('text/plain', emptyStream, keys), '');

  // Case 4: Valid JSON with redactions
  const jsonStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok": true, "secret": "shh"}'));
      controller.close();
    },
  });
  const jsonResult = await serializeBodyForLog('application/json', jsonStream, keys);
  assert.deepEqual(JSON.parse(jsonResult), { ok: true, secret: '[REDACTED]' });

  // Case 5: Invalid JSON
  const invalidJsonStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok": true, "secret":'));
      controller.close();
    },
  });
  const invalidJsonResult = await serializeBodyForLog('application/json', invalidJsonStream, keys);
  assert.equal(invalidJsonResult, '{"ok": true, "secret":');

  // Case 6: Non-JSON plain text
  const textStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('just some text'));
      controller.close();
    },
  });
  const textResult = await serializeBodyForLog('text/plain', textStream, keys);
  assert.equal(textResult, 'just some text');
});

test('serializeHeadersForLog', () => {
  const keys = new Set(['authorization']);
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('authorization', 'Bearer token123');

  const result = serializeHeadersForLog(headers, keys);
  assert.deepEqual(JSON.parse(result), {
    'content-type': 'application/json',
    authorization: '[REDACTED]',
  });
});

test('parseCallerInfo fallback and continue branches', () => {
  const originalCapture = Error.captureStackTrace;
  try {
    Error.captureStackTrace = (err) => {
      err.stack = [
        {
          getFileName: () => 'node:fs',
          getScriptNameOrSourceURL: () => null,
          getLineNumber: () => 10,
          getFunctionName: () => 'readFile',
        },
        {
          getFileName: () => null,
          getScriptNameOrSourceURL: () => 'internal/modules/cjs/loader.js',
          getLineNumber: () => 20,
          getFunctionName: () => null,
          getMethodName: () => null,
        },
      ];
    };

    const caller = parseCallerInfo(() => {});
    assert.deepEqual(caller, {
      filePath: null,
      lineNumber: null,
      functionName: null,
    });
  } finally {
    Error.captureStackTrace = originalCapture;
  }
});

