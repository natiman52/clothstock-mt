import { invoke } from '@tauri-apps/api/core';
import { mockInvoke } from './mockStore';

export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

/**
 * Invoke a POS command. Uses the Rust SQLite backend inside Tauri,
 * and a localStorage mock when the Vite page is opened in a browser.
 */
export async function pos(command, args = {}) {
  if (!isTauri()) {
    return mockInvoke(command, args);
  }
  try {
    return await invoke(command, args);
  } catch (err) {
    const message = typeof err === 'string' ? err : err?.message || 'Unexpected POS error';
    throw new Error(message);
  }
}
