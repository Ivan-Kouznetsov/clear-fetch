export interface ClearFetchOptions {
  databasePath?: string;
  redactionKeys?: readonly string[];
}

export type ClearFetchBootstrapOptions = ClearFetchOptions;

export interface CallerInfo {
  filePath: string | null;
  lineNumber: number | null;
  functionName: string | null;
}

export interface RequestLogRecord {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  protocol: string;
  host: string;
  path: string;
  queryParams: string;
  headers: string;
  body: string | null;
  callerFile: string | null;
  callerLine: number | null;
  callerFunction: string | null;
}

export interface ResponseLogRecord {
  id: string;
  requestId: string;
  timestamp: string;
  durationMs: number;
  status: number | null;
  statusText: string | null;
  headers: string | null;
  body: string | null;
  error: string | null;
}

export interface DatabaseHandle {
  insertRequest(record: RequestLogRecord): void;
  insertResponse(record: ResponseLogRecord): void;
  close(): void;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}
