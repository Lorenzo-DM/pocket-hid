import { useEffect, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import type { MacroStep } from '../protocol/messages';
import { K, CONSUMER, MOD } from '../protocol/hid';

interface Props {
  conn: DeviceLink;
  macros: string[];
}

// Fase 5: gestione macro. La lista vive nell'ESP (NVS) e arriva nel
// welcome/state; il contenuto si scarica con macro_get → macro_data.

type StepType = 'key' | 'text' | 'media' | 'wait';

interface Editing {
  id: string;
  steps: MacroStep[];
}

const KEY_OPTIONS: { label: string; code: number }[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({ label: l, code: K[l as keyof typeof K] })),
  ...'1234567890'.split('').map((d) => ({ label: d, code: K[`N${d}` as keyof typeof K] })),
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((l, i) => ({
    label: l,
    code: K.F1 + i,
  })),
  { label: 'Invio', code: K.ENTER },
  { label: 'Esc', code: K.ESC },
  { label: 'Tab', code: K.TAB },
  { label: 'Spazio', code: K.SPACE },
  { label: '⌫', code: K.BACKSPACE },
  { label: 'Del', code: K.DELETE },
  { label: '←', code: K.LEFT },
  { label: '→', code: K.RIGHT },
  { label: '↓', code: K.DOWN },
  { label: '↑', code: K.UP },
  { label: 'Home', code: K.HOME },
  { label: 'Fine', code: K.END },
  { label: 'PgSu', code: K.PAGEUP },
  { label: 'PgGiu', code: K.PAGEDOWN },
];

const MEDIA_OPTIONS: { label: string; code: number }[] = [
  { label: 'Vol +', code: CONSUMER.VOLUME_UP },
  { label: 'Vol -', code: CONSUMER.VOLUME_DOWN },
  { label: 'Mute', code: CONSUMER.MUTE },
  { label: 'Play/Pause', code: CONSUMER.PLAY_PAUSE },
  { label: 'Stop', code: CONSUMER.STOP },
  { label: 'Next', code: CONSUMER.NEXT_TRACK },
  { label: 'Prev', code: CONSUMER.PREV_TRACK },
  { label: 'Power', code: CONSUMER.POWER },
  { label: 'Lum +', code: CONSUMER.BRIGHTNESS_UP },
  { label: 'Lum -', code: CONSUMER.BRIGHTNESS_DOWN },
];

function mediaLabel(code: number): string {
  return MEDIA_OPTIONS.find((m) => m.code === code)?.label ?? `0x${code.toString(16)}`;
}

function stepLabel(s: MacroStep): string {
  if ('k' in s) {
    const key = KEY_OPTIONS.find((o) => o.code === s.k)?.label ?? `0x${s.k.toString(16)}`;
    const mods: string[] = [];
    if (s.m) {
      if (s.m & MOD.CTRL) mods.push('Ctrl');
      if (s.m & MOD.SHIFT) mods.push('Shift');
      if (s.m & MOD.ALT) mods.push('Alt');
      if (s.m & MOD.GUI) mods.push('Win');
    }
    return `Tasto ${mods.length ? mods.join('+') + '+' : ''}${key}`;
  }
  if ('s' in s) return `Testo: "${s.s.length > 24 ? s.s.slice(0, 24) + '…' : s.s}"`;
  if ('c' in s) return `Media: ${mediaLabel(s.c)}`;
  return `Attesa ${s.w} ms`;
}

export function MacroView({ conn, macros }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // macro_done: sblocca il pulsante Run; macro_data: apre l'editor
  useEffect(() => {
    const off = conn.onMessage?.((msg) => {
      if (msg.t === 'macro_done') {
        setBusy((b) => (b === msg.id ? null : b));
      } else if (msg.t === 'macro_data') {
        setEditing({ id: msg.id, steps: msg.steps });
      }
    });
    return () => off?.();
  }, [conn]);

  const run = (id: string) => {
    setBusy(id);
    conn.send({ t: 'macro_run', id });
    // sblocco di sicurezza se macro_done va perso
    setTimeout(() => setBusy((b) => (b === id ? null : b)), 10000);
  };

  const edit = (id: string) => conn.send({ t: 'macro_get', id });

  const remove = (id: string) => {
    if (!confirm(`Eliminare la macro "${id}"?`)) return;
    conn.send({ t: 'macro_del', id });
    if (editing?.id === id) setEditing(null);
  };

  const save = () => {
    if (!editing) return;
    conn.send({ t: 'macro_save', id: editing.id, steps: editing.steps });
    setEditing(null);
  };

  if (editing) {
    return (
      <MacroEditor
        editing={editing}
        onChange={setEditing}
        onSave={save}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="macro">
      <button className="primary" onClick={() => setEditing({ id: '', steps: [] })}>
        ＋ Nuova macro
      </button>

      {macros.length === 0 && (
        <p className="hint">
          Nessuna macro salvata nell'ESP. Una macro è una sequenza di tasti, testo,
          media e pause: utile per comandi ripetitivi.
        </p>
      )}

      <ul className="macro-list">
        {macros.map((id) => (
          <li key={id} className="macro-item">
            <span className="macro-name">{id}</span>
            <span className="macro-actions">
              <button
                className="key macro-btn"
                disabled={busy !== null}
                onClick={() => run(id)}
              >
                {busy === id ? '…' : '▶'}
              </button>
              <button className="key macro-btn" onClick={() => edit(id)}>✎</button>
              <button className="key macro-btn danger" onClick={() => remove(id)}>🗑</button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MacroEditor({
  editing,
  onChange,
  onSave,
  onCancel,
}: {
  editing: Editing;
  onChange: (e: Editing) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [stepType, setStepType] = useState<StepType>('key');
  const [keyIdx, setKeyIdx] = useState(0);
  const [mods, setMods] = useState(0);
  const [text, setText] = useState('');
  const [wait, setWait] = useState(500);
  const [mediaIdx, setMediaIdx] = useState(0);

  const addStep = () => {
    let step: MacroStep;
    if (stepType === 'key') {
      step = { k: KEY_OPTIONS[keyIdx].code, ...(mods ? { m: mods } : {}) };
    } else if (stepType === 'text') {
      if (!text) return;
      step = { s: text };
    } else if (stepType === 'media') {
      step = { c: MEDIA_OPTIONS[mediaIdx].code };
    } else {
      step = { w: Math.max(0, Math.min(60000, wait)) };
    }
    onChange({ ...editing, steps: [...editing.steps, step] });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= editing.steps.length) return;
    const steps = [...editing.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onChange({ ...editing, steps });
  };

  const removeStep = (i: number) => {
    onChange({ ...editing, steps: editing.steps.filter((_, x) => x !== i) });
  };

  const idOk = /^[a-zA-Z0-9_-]{1,20}$/.test(editing.id);
  const canSave = idOk && editing.steps.length > 0 && editing.steps.length <= 64;

  return (
    <div className="macro-editor">
      <label>
        Nome (a-z, 0-9, - _)
        <input
          type="text"
          value={editing.id}
          onChange={(e) => onChange({ ...editing, id: e.target.value })}
          placeholder="es. netflix"
          maxLength={20}
          spellCheck={false}
        />
      </label>

      <ol className="macro-steps">
        {editing.steps.map((s, i) => (
          <li key={i}>
            <span className="macro-step-label">{stepLabel(s)}</span>
            <span className="macro-actions">
              <button className="key macro-btn" onClick={() => move(i, -1)}>↑</button>
              <button className="key macro-btn" onClick={() => move(i, 1)}>↓</button>
              <button className="key macro-btn danger" onClick={() => removeStep(i)}>✕</button>
            </span>
          </li>
        ))}
        {editing.steps.length === 0 && <li className="muted">nessuno step: aggiungilo sotto</li>}
      </ol>

      <div className="macro-add">
        <select value={stepType} onChange={(e) => setStepType(e.target.value as StepType)}>
          <option value="key">Tasto</option>
          <option value="text">Testo</option>
          <option value="media">Media</option>
          <option value="wait">Attesa</option>
        </select>

        {stepType === 'key' && (
          <>
            <select value={keyIdx} onChange={(e) => setKeyIdx(Number(e.target.value))}>
              {KEY_OPTIONS.map((o, i) => (
                <option key={o.code} value={i}>{o.label}</option>
              ))}
            </select>
            <span className="macro-mods">
              {(['Ctrl', 'Shift', 'Alt', 'Win'] as const).map((label, bi) => (
                <button
                  key={label}
                  className={`key mod ${(mods & (1 << bi)) ? 'active' : ''}`}
                  onClick={() => setMods((m) => m ^ (1 << bi))}
                >
                  {label}
                </button>
              ))}
            </span>
          </>
        )}
        {stepType === 'text' && (
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="testo da digitare (ASCII)"
          />
        )}
        {stepType === 'media' && (
          <select value={mediaIdx} onChange={(e) => setMediaIdx(Number(e.target.value))}>
            {MEDIA_OPTIONS.map((o, i) => (
              <option key={o.code} value={i}>{o.label}</option>
            ))}
          </select>
        )}
        {stepType === 'wait' && (
          <input
            type="number"
            value={wait}
            min={0}
            max={60000}
            step={100}
            onChange={(e) => setWait(Number(e.target.value))}
          />
        )}

        <button className="key" onClick={addStep}>＋ aggiungi step</button>
      </div>

      <div className="macro-editor-actions">
        <button className="primary" disabled={!canSave} onClick={onSave}>
          Salva nell'ESP
        </button>
        <button className="key" onClick={onCancel}>Annulla</button>
      </div>
      {!idOk && <p className="warn">Nome non valido (1-20 caratteri [a-zA-Z0-9_-])</p>}
    </div>
  );
}
