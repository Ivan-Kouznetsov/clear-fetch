import type { ClearFetchBootstrapOptions } from './types.js';
import { createClearFetch } from './index.js';

export function initGlobalClearFetch(options: ClearFetchBootstrapOptions = {}): void {
  // Production must remain a hard no-op to avoid any bootstrap overhead in
  // deployed environments.
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (process.env.DEBUG !== '1') {
    return;
  }

  globalThis.fetch = createClearFetch(options);
}