import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

import type { DatabaseHandle, RequestLogRecord, ResponseLogRecord } from './types.js';

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT NOT NULL,
  path TEXT NOT NULL,
  query_params TEXT NOT NULL,
  headers TEXT NOT NULL,
  body TEXT,
  caller_file TEXT,
  caller_line INTEGER,
  caller_function TEXT
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  status INTEGER,
  status_text TEXT,
  headers TEXT,
  body TEXT,
  error TEXT,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
);
`;

export function openClearFetchDatabase(databasePath?: string): DatabaseHandle {
  const resolvedPath = databasePath ?? join(process.cwd(), '.clear-fetch', 'clear-fetch.sqlite');
  mkdirSync(dirname(resolvedPath), { recursive: true });

  const database = new DatabaseSync(resolvedPath);
  database.exec(schema);

  const insertRequestStatement = database.prepare(`
    INSERT INTO requests (
      id, timestamp, method, url, protocol, host, path, query_params, headers, body,
      caller_file, caller_line, caller_function
    ) VALUES (
      $id, $timestamp, $method, $url, $protocol, $host, $path, $queryParams, $headers, $body,
      $callerFile, $callerLine, $callerFunction
    )
  `);

  const insertResponseStatement = database.prepare(`
    INSERT INTO responses (
      id, request_id, timestamp, duration_ms, status, status_text, headers, body, error
    ) VALUES (
      $id, $requestId, $timestamp, $durationMs, $status, $statusText, $headers, $body, $error
    )
  `);

  return {
    insertRequest(record: RequestLogRecord): void {
      insertRequestStatement.run({
        $id: record.id,
        $timestamp: record.timestamp,
        $method: record.method,
        $url: record.url,
        $protocol: record.protocol,
        $host: record.host,
        $path: record.path,
        $queryParams: record.queryParams,
        $headers: record.headers,
        $body: record.body,
        $callerFile: record.callerFile,
        $callerLine: record.callerLine,
        $callerFunction: record.callerFunction,
      });
    },
    insertResponse(record: ResponseLogRecord): void {
      insertResponseStatement.run({
        $id: record.id,
        $requestId: record.requestId,
        $timestamp: record.timestamp,
        $durationMs: record.durationMs,
        $status: record.status,
        $statusText: record.statusText,
        $headers: record.headers,
        $body: record.body,
        $error: record.error,
      });
    },
    close(): void {
      database.close();
    },
  };
}

export function createRandomRequestId(): string {
  return randomUUID();
}