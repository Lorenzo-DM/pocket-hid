import { useEffect, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import type { MacroStep } from '../protocol/messages';
import { K, CONSUMER, MOD } from '../protocol/hid';
import { IconClose, IconEdit, IconMacro, IconPlus, IconTrash } from './Icons';

interface Props {
  conn: DeviceLink;
  macros: string[];
  vibrate: (p?: number | number[]) => void;
  onToast: (text: string, kind?: 'info' | 'error') => void;
}

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
  { label: '⌫ Backspace', code: K.BACKSPACE },
  { label: 'Del', code: K.DELETE },
  { label: '←', code: K.LEFT },
  { label: '→', code: K.RIGHT },
  { label: '↓', code: K.DOWN },
  { label: '↑', code: K.UP },
  { label: 'Home', code: K.HOME },
  { label: 'Fine', code: K.END },
  { label: 'PgSu', code: K.PAGEUP },
  { label: 'PgGiù', code: K.PAGEDOWN },
  { label: '(Solo modificatori, es. Win)', code: 0 },
];

const MEDIA_OPTIONS: { label: string; code: number }[] = [
  { label: 'Vol +', code: CONSUMER.VOLUME_UP },
  { label: 'Vol −', code: CONSUMER.VOLUME_DOWN },
  { label: 'Mute', code: CONSUMER.MUTE },
  { label: 'Play / Pausa', code: CONSUMER.PLAY_PAUSE },
  { label: 'Stop', code: CONSUMER.STOP },
  { label: 'Traccia succ.', code: CONSUMER.NEXT_TRACK },
  { label: 'Traccia prec.', code: CONSUMER.PREV_TRACK },
  { label: 'Power', code: CONSUMER.POWER },
  { label: 'Lum +', code: CONSUMER.BRIGHTNESS_UP },
  { label: 'Lum −', code: CONSUMER.BRIGHTNESS_DOWN },
];

const QUICK_STEPS: { label: string; step: MacroStep }[] = [
  { label: '⊞ Win', step: { k: 0, m: MOD.GUI } },
  { label: '↵ Invio', step: { k: K.ENTER } },
  { label: 'Esc', step: { k: K.ESC } },
  { label: 'Tab', step: { k: K.TAB } },
  { label: 'Alt+Tab', step: { k: K.TAB, m: MOD.ALT } },
  { label: '⏱ 500ms', step: { w: 500 } },
  { label: '⏯ Play', step: { c: CONSUMER.PLAY_PAUSE } },
];

function mediaLabel(code: number): string {
  return MEDIA_OPTIONS.find((m) => m.code === code)?.label ?? `0x${code.toString(16)}`;
}

function stepLabel(s: MacroStep): string {
  if ('k' in s) {
    const mods: string[] = [];
    if (s.m) {
      if (s.m & MOD.CTRL) mods.push('Ctrl');
      if (s.m & MOD.SHIFT) mods.push('Shift');
      if (s.m & MOD.ALT) mods.push('Alt');
      if (s.m & MOD.GUI) mods.push('Win');
    }
    if (s.k === 0) return mods.join('+') || 'Mod';
    const key = KEY_OPTIONS.find((o) => o.code === s.k)?.label ?? `0x${s.k.toString(16)}`;
    return `${mods.length ? mods.join('+') + '+' : ''}${key}`;
  }
  if ('s' in s) return `"${s.s.length > 26 ? s.s.slice(0, 26) + '…' : s.s}"`;
  if ('c' in s) return mediaLabel(s.c);
  return `${s.w} ms`;
}

function stepBadge(s: MacroStep): string {
  if ('k' in s) return 'TASTO';
  if ('s' in s) return 'TESTO';
  if ('c' in s) return 'MEDIA';
  return 'ATTESA';
}

export function MacroView({ conn, macros, vibrate, onToast }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    const off = conn.onMessage?.((msg) => {
      if (msg.t === 'macro_done') {
        setBusy((b) => (b === msg.id ? null : b));
        onToast(`Macro "${msg.id}" completata`);
      } else if (msg.t === 'macro_data') {
        setEditing({ id: msg.id, steps: msg.steps });
      }
    });
    return () => off?.();
  }, [conn, onToast]);

  const run = (id: string) => {
    if (busy !== null) return;
    setBusy(id);
    vibrate(14);
    conn.send({ t: 'macro_run', id });
    setTimeout(() => setBusy((b) => (b === id ? null : b)), 10000);
  };

  const edit = (id: string) => {
    setConfirmDel(null);
    conn.send({ t: 'macro_get', id });
  };

  const remove = (id: string) => {
    if (confirmDel !== id) {
      setConfirmDel(id);
      vibrate([10, 30, 10]);
      return;
    }
    setConfirmDel(null);
    conn.send({ t: 'macro_del', id });
    onToast(`Macro "${id}" eliminata`);
    if (editing?.id === id) setEditing(null);
  };

  const save = () => {
    if (!editing) return;
    conn.send({ t: 'macro_save', id: editing.id, steps: editing.steps });
    vibrate(12);
    onToast(`Macro "${editing.id}" salvata`);
    setEditing(null);
    setEditMode(false);
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
    <div className="macro-screen">
      <div className="macro-head">
        <div>
          <h2>Macro</h2>
          <span className="muted-sm">{macros.length} / 12 salvate sull&apos;ESP</span>
        </div>
        <div className="macro-head-actions">
          {macros.length > 0 && (
            <button
              type="button"
              className={`btn-secondary sm ${editMode ? 'active' : ''}`}
              onClick={() => {
                setEditMode((e) => !e);
                setConfirmDel(null);
              }}
            >
              {editMode ? 'Fine' : 'Gestisci'}
            </button>
          )}
          <button
            type="button"
            className="btn-primary sm"
            disabled={macros.length >= 12}
            onClick={() => {
              setEditMode(false);
              setEditing({ id: '', steps: [] });
            }}
          >
            <IconPlus size={16} />
            <span>Nuova</span>
          </button>
        </div>
      </div>

      {macros.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <IconMacro size={28} />
          </div>
          <h3>Nessuna macro salvata</h3>
          <p className="muted">
            Crea scorciatoie multi-step (tasti, testo, comandi media e pause) salvate direttamente nella memoria dell&apos;ESP32.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setEditing({ id: '', steps: [] })}
          >
            <IconPlus size={17} />
            <span>Crea la prima macro</span>
          </button>
        </div>
      ) : (
        <div className="macro-grid">
          {macros.map((id) => {
            const isRunning = busy === id;
            const isConfirming = confirmDel === id;

            if (editMode) {
              return (
                <div key={id} className="macro-card editing">
                  <span className="macro-card-title">{id}</span>
                  <div className="macro-card-tools">
                    <button
                      type="button"
                      className="btn-secondary sm"
                      onClick={() => edit(id)}
                    >
                      <IconEdit size={15} />
                      <span>Modifica</span>
                    </button>
                    <button
                      type="button"
                      className={`btn-danger sm ${isConfirming ? 'armed' : ''}`}
                      onClick={() => remove(id)}
                    >
                      <IconTrash size={15} />
                      <span>{isConfirming ? 'Sicuro?' : ''}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={id}
                type="button"
                className={`macro-card ${isRunning ? 'running' : ''}`}
                disabled={busy !== null}
                onClick={() => run(id)}
              >
                <span className="macro-card-icon">
                  <IconMacro size={18} />
                </span>
                <span className="macro-card-title">{id}</span>
                <span className="macro-card-sub">
                  {isRunning ? 'In esecuzione…' : 'Tocca per eseguire'}
                </span>
              </button>
            );
          })}
        </div>
      )}
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

  const pushStep = (step: MacroStep) => {
    if (editing.steps.length >= 64) return;
    onChange({ ...editing, steps: [...editing.steps, step] });
  };

  const addStep = () => {
    if (stepType === 'key') {
      const code = KEY_OPTIONS[keyIdx].code;
      if (code === 0 && mods === 0) return;
      pushStep({ k: code, ...(mods ? { m: mods } : {}) });
    } else if (stepType === 'text') {
      if (!text) return;
      pushStep({ s: text });
      setText('');
    } else if (stepType === 'media') {
      pushStep({ c: MEDIA_OPTIONS[mediaIdx].code });
    } else {
      pushStep({ w: Math.max(0, Math.min(60000, wait)) });
    }
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
      <div className="macro-head">
        <h2>{editing.id ? `Macro: ${editing.id}` : 'Nuova macro'}</h2>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Annulla">
          <IconClose size={20} />
        </button>
      </div>

      <label className="field">
        <span>Nome macro <small className="muted">(a-z, 0-9, - _)</small></span>
        <input
          type="text"
          value={editing.id}
          onChange={(e) => onChange({ ...editing, id: e.target.value })}
          placeholder="es. netflix, accedi, copia-url"
          maxLength={20}
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>

      {!idOk && editing.id.length > 0 && (
        <p className="callout warn">Usa solo lettere, cifre, trattini o underscore (1–20 caratteri).</p>
      )}

      {/* Inserimento rapido */}
      <div className="editor-card">
        <div className="editor-card-head">
          <span>Aggiungi step</span>
          <span className="muted-sm">{editing.steps.length} / 64</span>
        </div>

        <div className="shortcut-strip">
          {QUICK_STEPS.map((q) => (
            <button
              key={q.label}
              type="button"
              className="shortcut-pill"
              onClick={() => pushStep(q.step)}
            >
              ＋ {q.label}
            </button>
          ))}
        </div>

        <div className="segmented compact">
          {([
            ['key', 'Tasto'],
            ['text', 'Testo'],
            ['media', 'Media'],
            ['wait', 'Attesa'],
          ] as [StepType, string][]).map(([t, label]) => (
            <button
              key={t}
              type="button"
              className={`seg-btn ${stepType === t ? 'active' : ''}`}
              onClick={() => setStepType(t)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="editor-builder">
          {stepType === 'key' && (
            <>
              <select value={keyIdx} onChange={(e) => setKeyIdx(Number(e.target.value))}>
                {KEY_OPTIONS.map((o, i) => (
                  <option key={o.code} value={i}>{o.label}</option>
                ))}
              </select>
              <div className="kb-mods compact">
                {(['Ctrl', 'Shift', 'Alt', 'Win'] as const).map((label, bi) => (
                  <button
                    key={label}
                    type="button"
                    className={`key mod ${(mods & (1 << bi)) ? 'active' : ''}`}
                    onClick={() => setMods((m) => m ^ (1 << bi))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {stepType === 'text' && (
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Testo da digitare (ASCII)"
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
            <div className="wait-row">
              <input
                type="number"
                value={wait}
                min={0}
                max={60000}
                step={100}
                onChange={(e) => setWait(Number(e.target.value))}
              />
              <span className="muted">ms</span>
            </div>
          )}

          <button type="button" className="btn-secondary full" onClick={addStep}>
            <IconPlus size={16} />
            <span>Aggiungi step</span>
          </button>
        </div>
      </div>

      {/* Lista step */}
      <ol className="macro-steps">
        {editing.steps.map((s, i) => (
          <li key={i} className="macro-step-row">
            <span className="step-num">{i + 1}</span>
            <span className="step-badge">{stepBadge(s)}</span>
            <span className="step-text">{stepLabel(s)}</span>
            <span className="step-actions">
              <button
                type="button"
                className="step-btn"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Sposta su"
              >
                ↑
              </button>
              <button
                type="button"
                className="step-btn"
                disabled={i === editing.steps.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Sposta giù"
              >
                ↓
              </button>
              <button
                type="button"
                className="step-btn danger"
                onClick={() => removeStep(i)}
                aria-label="Elimina step"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
        {editing.steps.length === 0 && (
          <li className="macro-step-empty">Nessuno step: aggiungine almeno uno sopra.</li>
        )}
      </ol>

      <div className="macro-editor-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Annulla
        </button>
        <button type="button" className="btn-primary" disabled={!canSave} onClick={onSave}>
          Salva sull&apos;ESP
        </button>
      </div>
    </div>
  );
}
