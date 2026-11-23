// Tipi messaggi — schema in docs/protocol.md (fonte di verità)

// Step macro: v. docs/protocol.md "Formato step macro"
export type MacroStep =
  | { k: number; m?: number } // tap tasto (keycode HID + mods)
  | { s: string }             // testo
  | { c: number }             // consumer/media
  | { w: number };            // attesa ms

export type OutMsg =
  | { t: 'hello'; v: number; caps?: string[]; token?: string }
  | { t: 'key'; code: number; mods: number; act: 'd' | 'u' | 't' }
  | { t: 'text'; s: string }
  | { t: 'consumer'; code: number }
  | { t: 'mouse'; dx: number; dy: number }
  | { t: 'mbtn'; b: number; act: 'd' | 'u' | 'c' }
  | { t: 'scroll'; dx: number; dy: number }
  | { t: 'macro_run'; id: string }
  | { t: 'macro_save'; id: string; steps: MacroStep[] }
  | { t: 'macro_del'; id: string }
  | { t: 'macro_get'; id: string }
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
  | { t: 'macro_done'; id: string }
  | ({ t: 'macro_data'; id: string; steps: MacroStep[] })
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
