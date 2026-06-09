import type { ClearFetchOptions, RequestLogRecord, ResponseLogRecord } from './types.js';
import { createRedactionKeySet, parseCallerInfo, serializeBodyForLog, serializeHeadersForLog } from './utils.js';
import { createRandomRequestId, openClearFetchDatabase } from './db.js';
import { join } from 'node:path';

const defaultDatabasePath = join(process.cwd(), '.clear-fetch', 'clear-fetch.sqlite');

export function createClearFetch(options: ClearFetchOptions = {}): typeof fetch {
  const originalFetch = globalThis.fetch;
  const mergedOptions: Required<ClearFetchOptions> = {
    databasePath: options.databasePath ?? defaultDatabasePath,
    redactionKeys: options.redactionKeys ?? [],
  };

  const database = openClearFetchDatabase(mergedOptions.databasePath);
  const redactionKeys = createRedactionKeySet(mergedOptions.redactionKeys);

  const wrappedFetch: typeof fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const startedAt = Date.now();
    const requestId = createRandomRequestId();
    const callerInfo = parseCallerInfo(wrappedFetch);
    const request = new Request(input, init);
    // Clone the request before any logging reads so the body remains intact for
    // the actual outbound fetch call, even when the body is a stream.
    const requestClone = request.clone();

    const requestContentType = request.headers.get('content-type');
    const requestBody = await serializeBodyForLog(requestContentType, requestClone.body, redactionKeys);
    const requestHeaders = serializeHeadersForLog(request.headers, redactionKeys);
    const requestUrl = new URL(request.url);

    const requestRecord: RequestLogRecord = {
      id: requestId,
      timestamp: new Date(startedAt).toISOString(),
      method: request.method,
      url: request.url,
      protocol: requestUrl.protocol,
      host: requestUrl.host,
      path: requestUrl.pathname,
      queryParams: JSON.stringify(Object.fromEntries(requestUrl.searchParams.entries())),
      headers: requestHeaders,
      body: requestBody,
      callerFile: callerInfo.filePath,
      callerLine: callerInfo.lineNumber,
      callerFunction: callerInfo.functionName,
    };

    database.insertRequest(requestRecord);

    try {
      const response = await originalFetch(request);

      // Response bodies are cloned before inspection for the same reason: the
      // original response stream must be returned to the caller unconsumed.
      const responseClone = response.clone();
      const responseContentType = response.headers.get('content-type');
      const responseHeaders = serializeHeadersForLog(response.headers, redactionKeys);
      const responseBody = await serializeBodyForLog(responseContentType, responseClone.body, redactionKeys);

      const responseRecord: ResponseLogRecord = {
        id: createRandomRequestId(),
        requestId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        error: null,
      };

      database.insertResponse(responseRecord);
      return response;
    } catch (error) {
      const responseRecord: ResponseLogRecord = {
        id: createRandomRequestId(),
        requestId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        status: null,
        statusText: null,
        headers: null,
        body: null,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      };

      database.insertResponse(responseRecord);
      throw error;
    }
  };

  return wrappedFetch;
}