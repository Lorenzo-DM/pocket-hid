import { useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { K, MOD } from '../protocol/hid';

interface Props {
  conn: DeviceLink;
}

interface KeyDef {
  label: string;
  code: number;
  wide?: number; // peso flex aggiuntivo
}

// Modificatori "sticky": si attivano con un tap e si applicano al tasto
// successivo, poi si disattivano (ux naturale su touch).
// I mod attivi si combinano (es. Ctrl+Shift) toccandoli più volte.

const MOD_KEYS: { id: number; label: string }[] = [
  { id: MOD.CTRL, label: 'Ctrl' },
  { id: MOD.ALT, label: 'Alt' },
  { id: MOD.GUI, label: 'Win' },
  { id: MOD.SHIFT, label: 'Shift' },
];

// Tasti speciali estesi (fase 4): navigazione e lock, posizione US
const SPECIAL_KEYS: KeyDef[] = [
  { label: 'Stamp', code: K.PRINTSCREEN },
  { label: 'SclL', code: K.SCROLLLOCK },
  { label: 'Pausa', code: K.PAUSE },
  { label: 'Ins', code: K.INSERT },
  { label: 'Home', code: K.HOME },
  { label: 'Fine', code: K.END },
  { label: 'PgSu', code: K.PAGEUP },
  { label: 'PgGiu', code: K.PAGEDOWN },
  { label: '⇪ Caps', code: K.CAPSLOCK },
];

const ROWS: KeyDef[][] = [
  [
    { label: 'Esc', code: K.ESC },
    ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map(
      (label, i) => ({ label, code: K.F1 + i })
    ),
  ],
  [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((label, i) => ({
      label,
      code: K.N1 + i,
    })),
    { label: '⌫', code: K.BACKSPACE, wide: 1.5 },
  ],
  [
    { label: 'Tab', code: K.TAB, wide: 1.5 },
    ...['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((l) => ({
      label: l,
      code: K[l as keyof typeof K],
    })),
  ],
  [
    ...['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((l) => ({
      label: l,
      code: K[l as keyof typeof K],
    })),
    { label: 'Invio', code: K.ENTER, wide: 2 },
  ],
  [
    ...['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((l) => ({
      label: l,
      code: K[l as keyof typeof K],
    })),
    { label: '←', code: K.LEFT },
    { label: '↓', code: K.DOWN },
    { label: '↑', code: K.UP },
    { label: '→', code: K.RIGHT },
  ],
];

export function KeyboardView({ conn }: Props) {
  const [mods, setMods] = useState(0);

  const tapKey = (code: number) => {
    conn.send({ t: 'key', code, mods, act: 't' });
    if (mods !== 0) setMods(0); // one-shot
  };

  return (
    <div className="keyboard">
      <div className="kb-mods">
        {MOD_KEYS.map((m) => (
          <button
            key={m.id}
            className={`key mod ${(mods & m.id) ? 'active' : ''}`}
            onClick={() => setMods((prev) => prev ^ m.id)}
          >
            {m.label}
          </button>
        ))}
        <button className="key" onClick={() => tapKey(K.DELETE)}>Del</button>
      </div>

      <div className="kb-row kb-special">
        {SPECIAL_KEYS.map((k, i) => (
          <button key={i} className="key" onClick={() => tapKey(k.code)}>
            {k.label}
          </button>
        ))}
      </div>

      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map((k, j) => (
            <button
              key={j}
              className="key"
              style={k.wide ? { flex: k.wide * 1.5 } : undefined}
              onClick={() => tapKey(k.code)}
            >
              {k.label}
            </button>
          ))}
        </div>
      ))}

      <button
        className="key key-space"
        onClick={() => tapKey(K.SPACE)}
      >
        Spazio
      </button>
    </div>
  );
}
