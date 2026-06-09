import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { CallerInfo, JsonObject, JsonValue } from './types.js';

const defaultRedactionKeys = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'authentication',
  'auth',
  'auth_token',
  'access_token',
  'refresh_token',
  'id_token',
  'jwt',
  'bearer',
  'session',
  'sessionid',
  'session_id',
  'csrf',
  'csrf_token',
  'xsrf',
  'xsrf_token',
  'token',
  'secret',
  'password',
]);

export function createRedactionKeySet(keys?: readonly string[]): Set<string> {
  const merged = new Set(defaultRedactionKeys);
  for (const key of keys ?? []) {
    merged.add(key.toLowerCase());
  }
  return merged;
}

export function redactDeep<T>(value: T, keys: Set<string> = defaultRedactionKeys): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, keys)) as T;
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(objectValue)) {
      if (keys.has(key.toLowerCase())) {
        redacted[key] = '[REDACTED]';
        continue;
      }

      redacted[key] = redactDeep(entry, keys);
    }

    return redacted as T;
  }

  return value;
}

export function parseCallerInfo(skipFn: Function): CallerInfo {
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    // Capture V8 CallSite objects instead of a formatted string so we can
    // reliably extract file, line, and function metadata from the first
    // external frame that actually triggered the wrapped fetch call.
    Error.prepareStackTrace = (_, stackTrace) => stackTrace;

    const error = new Error();
    Error.captureStackTrace(error, skipFn);

    const frames = error.stack as unknown as NodeJS.CallSite[] | undefined;
    for (const frame of frames ?? []) {
      const filePath = frame.getFileName() ?? frame.getScriptNameOrSourceURL();
      if (!filePath || filePath.startsWith('node:') || filePath.includes('internal')) {
        continue;
      }

      return {
        filePath,
        lineNumber: frame.getLineNumber(),
        functionName: frame.getFunctionName() ?? frame.getMethodName() ?? null,
      };
    }
  } finally {
    Error.prepareStackTrace = originalPrepareStackTrace;
  }

  return {
    filePath: null,
    lineNumber: null,
    functionName: null,
  };
}

export function normalizeHeaders(headers: Headers): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      const getSetCookie = headers as Headers & { getSetCookie?: () => string[] };
      const setCookies = getSetCookie.getSetCookie?.();
      if (setCookies?.length) {
        normalized[key] = setCookies;
      } else {
        normalized[key] = value;
      }
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

export function isBinaryContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const lowerCaseContentType = contentType.toLowerCase();
  return !(
    lowerCaseContentType.startsWith('text/') ||
    lowerCaseContentType.includes('json') ||
    lowerCaseContentType.includes('+json') ||
    lowerCaseContentType.includes('xml') ||
    lowerCaseContentType.includes('javascript') ||
    lowerCaseContentType.includes('x-www-form-urlencoded')
  );
}

export async function readStreamAsText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return '';
  }

  const nodeReadable = Readable.fromWeb(stream);
  const chunks: Buffer[] = [];

  for await (const chunk of nodeReadable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

export async function hashReadableStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  const hash = createHash('sha256');

  if (!stream) {
    return hash.digest('hex');
  }

  const nodeReadable = Readable.fromWeb(stream);
  for await (const chunk of nodeReadable) {
    hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return hash.digest('hex');
}

export async function serializeBodyForLog(
  contentType: string | null,
  bodyStream: ReadableStream<Uint8Array> | null,
  redactionKeys: Set<string>,
): Promise<string | null> {
  if (!bodyStream) {
    return null;
  }

  if (isBinaryContentType(contentType)) {
    // Binary payloads are never decoded as text. We hash the cloned stream so
    // logs remain safe and compact without consuming the original body.
    const hash = await hashReadableStream(bodyStream);
    return `[Binary File] SHA-256: ${hash}`;
  }

  const rawBody = await readStreamAsText(bodyStream);
  if (!rawBody) {
    return '';
  }

  if (contentType?.toLowerCase().includes('json')) {
    try {
      const parsedBody = JSON.parse(rawBody) as JsonValue;
      const redactedBody = redactDeep(parsedBody, redactionKeys);
      return JSON.stringify(redactedBody);
    } catch {
      return rawBody;
    }
  }

  return rawBody;
}

export function serializeHeadersForLog(headers: Headers, redactionKeys: Set<string>): string {
  const normalized = normalizeHeaders(headers);
  const redacted = redactDeep(normalized as JsonObject, redactionKeys);
  return JSON.stringify(redacted);
}