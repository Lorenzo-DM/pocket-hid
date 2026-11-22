// Tipi messaggi — schema in docs/protocol.md (fonte di verità)

export type OutMsg =
  | { t: 'hello'; v: number; caps?: string[]; token?: string }
  | { t: 'key'; code: number; mods: number; act: 'd' | 'u' | 't' }
  | { t: 'text'; s: string }
  | { t: 'consumer'; code: number }
  | { t: 'mouse'; dx: number; dy: number }
  | { t: 'mbtn'; b: number; act: 'd' | 'u' | 'c' }
  | { t: 'scroll'; dx: number; dy: number }
  | { t: 'state' };

export interface DeviceInfo {
  fw: string;
  layout: string;
  usb: 'mounted' | 'unmounted';
  macros: string[];
}

export type InMsg =
  | ({ t: 'welcome' } & DeviceInfo)
  | ({ t: 'state' } & DeviceInfo)
  | { t: 'error'; msg: string };

export function parseInMsg(raw: string): InMsg | null {
  try {
    const o = JSON.parse(raw);
    if (o && typeof o.t === 'string') return o as InMsg;
  } catch {
    // non-JSON: ignora
  }
  return null;
}

export function serialize(msg: OutMsg): string {
  return JSON.stringify(msg);
}
