# @ivan-kouznetsov/clear-fetch

A lightweight, production-safe HTTP logging wrapper for native Node.js `fetch`.

`clear-fetch` intercepts outbound HTTP requests and inbound responses, logging them directly to a local SQLite database for easy debugging, troubleshooting, and analysis. It is designed to be completely safe for production use by remaining a hard no-op in production.

---

## Features

- **Native Interception**: Wraps or globally patches Node.js native `fetch` (no external request libraries required).
- **SQLite Log Store**: Keeps logs in a local SQLite database (`.clear-fetch/clear-fetch.sqlite` by default).
- **Sensitive Data Redaction**: Automatically redacts specified keys (e.g. `Authorization`, `Cookie`, passwords) from both headers and JSON bodies.
- **Stream-Safe**: Clones request and response streams to prevent interfering with your application's fetch consumption.
- **Caller Location Tracing**: Records the source file, line number, and function name that initiated the fetch call.
- **Production-Safe**: Safe for production setups, returning a hard no-op when `process.env.NODE_ENV === 'production'`.

---

## Installation

```bash
npm install @ivan-kouznetsov/clear-fetch
```

*Note: Requires Node.js `>= 22.5.0`.*

---

## Usage

### Option 1: Explicit Wrapper (`createClearFetch`)

Use this option to create a wrapped fetch instance that you can use explicitly in your modules.

#### Default Usage
```typescript
import { createClearFetch } from '@ivan-kouznetsov/clear-fetch';

// Initialize with defaults (logs to .clear-fetch/clear-fetch.sqlite, redacts standard sensitive keys)
const clearFetch = createClearFetch();

// Use it exactly like standard fetch
const response = await clearFetch('https://api.github.com/users/ivan-kouznetsov');
const data = await response.json();
```

#### Custom Options
```typescript
const clearFetch = createClearFetch({
  // Custom SQLite path
  databasePath: './logs/http-traffic.sqlite',
  // Extra key names in headers or JSON bodies to redact (in addition to default keys)
  redactionKeys: ['custom-api-key']
});
```

### Option 2: Global Bootstrap (`initGlobalClearFetch`)

Use this option to globally intercept all native `fetch` calls in your application.

#### Default Usage
```typescript
import { initGlobalClearFetch } from '@ivan-kouznetsov/clear-fetch/dist/init.js';

// Patches globalThis.fetch with defaults when process.env.NODE_ENV !== 'production' and process.env.DEBUG === '1'
initGlobalClearFetch();

// All fetch calls will now log to SQLite when run with DEBUG=1
const response = await fetch('https://api.example.com/data');
```

#### Custom Options
```typescript
initGlobalClearFetch({
  databasePath: './logs/global-http.sqlite',
  redactionKeys: ['custom-api-key']
});
```

To run your app with global logging enabled:
```bash
DEBUG=1 node app.js
```

---

## Configuration & Defaults

### Database Path
By default, logs are written to:
`[project-root]/.clear-fetch/clear-fetch.sqlite`

You can customize this path by specifying `databasePath` when calling `createClearFetch` or `initGlobalClearFetch`.

### Default Redaction Keys
To ensure that credentials, cookies, and tokens are never written to disk by default, the library includes a built-in list of redaction keys that are automatically applied case-insensitively to both HTTP headers and JSON bodies:

*   **Credentials & Auth**: `authorization`, `proxy-authorization`, `authentication`, `auth`, `auth_token`, `access_token`, `refresh_token`, `id_token`, `jwt`, `bearer`
*   **Cookies & Sessions**: `cookie`, `set-cookie`, `session`, `sessionid`, `session_id`
*   **API Keys & Secrets**: `token`, `secret`, `password`, `x-api-key`, `api-key`, `x-auth-token`, `x-access-token`, `x-csrf-token`, `x-xsrf-token`, `csrf`, `csrf_token`, `xsrf`, `xsrf_token`

When you provide custom `redactionKeys` in the options, they are **merged with** (appended to) this default set. You do not need to re-specify these default keys.

---

## SQLite Log Database Schema

Logs are saved to `requests` and `responses` tables in the SQLite database.

### `requests` Table
- `id` (TEXT, PK): Unique request ID.
- `timestamp` (TEXT): ISO 8601 timestamp.
- `method` (TEXT): HTTP verb (GET, POST, etc.).
- `url` (TEXT): Full target URL.
- `protocol` (TEXT): Target protocol.
- `host` (TEXT): Hostname.
- `path` (TEXT): Request pathname.
- `queryParams` (TEXT): JSON string of query parameters.
- `headers` (TEXT): JSON string of request headers (redacted).
- `body` (TEXT): Request body content (redacted, or hash of binary contents).
- `callerFile` (TEXT): Path to the source file that initiated the fetch.
- `callerLine` (INTEGER): Line number of the fetch call.
- `callerFunction` (TEXT): Name of the function that initiated the fetch.

### `responses` Table
- `id` (TEXT, PK): Unique response ID.
- `requestId` (TEXT, FK): Matches the `requests.id`.
- `timestamp` (TEXT): ISO 8601 timestamp.
- `durationMs` (INTEGER): Time elapsed between request and response.
- `status` (INTEGER): HTTP status code.
- `statusText` (TEXT): HTTP status text.
- `headers` (TEXT): JSON string of response headers (redacted).
- `body` (TEXT): Response body content (redacted, or hash of binary contents).
- `error` (TEXT): Error stack trace or message if the fetch threw an exception.

---

## License

[MIT](LICENSE)
