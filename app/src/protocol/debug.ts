// Debug/demo mode: lets you use the app without an ESP32, with a simulated
// connection and an on-screen log of exchanged messages.

const DEBUG_KEY = 'mk.debug';

export function isDebugMode(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDebugMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEBUG_KEY, '1');
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    // storage unavailable: flag applies only to this session
  }
}

// ---- shared log (tx/rx/info) ----

export interface LogLine {
  dir: 'tx' | 'rx' | 'info';
  text: string;
  time: string;
}

const MAX_LINES = 100;
let lines: LogLine[] = [];
const listeners = new Set<() => void>();

export function debugLog(dir: LogLine['dir'], text: string): void {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  lines = [...lines.slice(-(MAX_LINES - 1)), { dir, text, time }];
  listeners.forEach((fn) => fn());
}

export function getDebugLog(): LogLine[] {
  return lines;
}

export function subscribeDebugLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearDebugLog(): void {
  lines = [];
  listeners.forEach((fn) => fn());
}
