import { useEffect, useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import type { MacroStep } from '../protocol/messages';
import { K, CONSUMER, MOD } from '../protocol/hid';
import { transliterateAscii, type Prefs } from '../hooks/usePrefs';
import {
  exportMacrosJson,
  parseMacrosJson,
  useLocalMacros,
  validateForEsp,
  type LocalMacro,
} from '../hooks/useLocalMacros';
import { IconClose, IconEdit, IconMacro, IconPlus, IconTrash } from './Icons';

interface Props {
  conn: DeviceLink;
  macros: string[]; // macros stored on ESP32 (NVS)
  prefs: Prefs;
  layout: string;
  vibrate: (p?: number | number[]) => void;
  onToast: (text: string, kind?: 'info' | 'error') => void;
}

type StepType = 'key' | 'text' | 'media' | 'wait';

interface Editing {
  id?: string;
  name: string;
  steps: MacroStep[];
}

const KEY_OPTIONS: { label: string; code: number }[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({ label: l, code: K[l as keyof typeof K] })),
  ...'1234567890'.split('').map((d) => ({ label: d, code: K[`N${d}` as keyof typeof K] })),
  ...['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((l, i) => ({
    label: l,
    code: K.F1 + i,
  })),
  { label: 'Enter', code: K.ENTER },
  { label: 'Esc', code: K.ESC },
  { label: 'Tab', code: K.TAB },
  { label: 'Space', code: K.SPACE },
  { label: '⌫ Backspace', code: K.BACKSPACE },
  { label: 'Del', code: K.DELETE },
  { label: '←', code: K.LEFT },
  { label: '→', code: K.RIGHT },
  { label: '↓', code: K.DOWN },
  { label: '↑', code: K.UP },
  { label: 'Home', code: K.HOME },
  { label: 'End', code: K.END },
  { label: 'PgUp', code: K.PAGEUP },
  { label: 'PgDn', code: K.PAGEDOWN },
  { label: '- / _', code: K.MINUS },
  { label: '= / +', code: K.EQUAL },
  { label: '[ / {', code: K.LBRACKET },
  { label: '] / }', code: K.RBRACKET },
  { label: '\\ / |', code: K.BACKSLASH },
  { label: '; / :', code: K.SEMICOLON },
  { label: "' / \"", code: K.QUOTE },
  { label: '` / ~', code: K.GRAVE },
  { label: ', / <', code: K.COMMA },
  { label: '. / >', code: K.DOT },
  { label: '/ / ?', code: K.SLASH },
  { label: '(Modifiers only, e.g. Win)', code: 0 },
];

const MEDIA_OPTIONS: { label: string; code: number }[] = [
  { label: 'Vol +', code: CONSUMER.VOLUME_UP },
  { label: 'Vol −', code: CONSUMER.VOLUME_DOWN },
  { label: 'Mute', code: CONSUMER.MUTE },
  { label: 'Play / Pause', code: CONSUMER.PLAY_PAUSE },
  { label: 'Stop', code: CONSUMER.STOP },
  { label: 'Next track', code: CONSUMER.NEXT_TRACK },
  { label: 'Prev track', code: CONSUMER.PREV_TRACK },
  { label: 'Power', code: CONSUMER.POWER },
  { label: 'Bright +', code: CONSUMER.BRIGHTNESS_UP },
  { label: 'Bright −', code: CONSUMER.BRIGHTNESS_DOWN },
];

const QUICK_STEPS: { label: string; step: MacroStep }[] = [
  { label: 'Ctrl+Alt+T', step: { k: K.T, m: MOD.CTRL | MOD.ALT } },
  { label: '⊞ Win', step: { k: 0, m: MOD.GUI } },
  { label: '↵ Enter', step: { k: K.ENTER } },
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
  if ('k' in s) return 'KEY';
  if ('s' in s) return 'TEXT';
  if ('c' in s) return 'MEDIA';
  return 'WAIT';
}

export function MacroView({ conn, macros: espMacros, prefs, layout, vibrate, onToast }: Props) {
  const { macros: localMacros, upsertMacro, deleteMacro, importMacros } = useLocalMacros();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [runningLocalId, setRunningLocalId] = useState<string | null>(null);
  const [busyEspId, setBusyEspId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runTokenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullingEspRef = useRef<string | null>(null);

  const stopLocalRun = () => {
    runTokenRef.current += 1;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunningLocalId(null);
  };

  useEffect(() => {
    return () => {
      runTokenRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const off = conn.onMessage?.((msg) => {
      if (msg.t === 'macro_done') {
        setBusyEspId((b) => (b === msg.id ? null : b));
        onToast(`ESP macro "${msg.id}" completed`);
      } else if (msg.t === 'macro_data') {
        if (pullingEspRef.current === msg.id) {
          pullingEspRef.current = null;
          importMacros([{ name: msg.id, steps: msg.steps }]);
          onToast(`"${msg.id}" copied to phone`);
        }
      }
    });
    return () => off?.();
  }, [conn, importMacros, onToast]);

  const sleepCancellable = (ms: number, token: number): Promise<boolean> =>
    new Promise((resolve) => {
      if (runTokenRef.current !== token) {
        resolve(false);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        resolve(runTokenRef.current === token);
      }, ms);
    });

  const runLocal = async (macro: LocalMacro) => {
    if (runningLocalId === macro.id) {
      stopLocalRun();
      vibrate(8);
      onToast(`Macro "${macro.name}" stopped`);
      return;
    }
    if (runningLocalId !== null || busyEspId !== null) return;

    const token = ++runTokenRef.current;
    setRunningLocalId(macro.id);
    vibrate(14);

    for (const step of macro.steps) {
      if (runTokenRef.current !== token) return;

      if ('k' in step) {
        conn.send({ t: 'key', code: step.k, mods: step.m ?? 0, act: 't' });
        if (!(await sleepCancellable(50, token))) return;
      } else if ('s' in step) {
        const payload = layout !== 'it' && prefs.transliterate ? transliterateAscii(step.s) : step.s;
        if (payload) {
          conn.send({ t: 'text', s: payload });
          const estMs = Math.max(80, payload.length * 16 + 40);
          if (!(await sleepCancellable(estMs, token))) return;
        }
      } else if ('c' in step) {
        conn.send({ t: 'consumer', code: step.c });
        if (!(await sleepCancellable(60, token))) return;
      } else if ('w' in step) {
        if (!(await sleepCancellable(step.w, token))) return;
      }
    }

    if (runTokenRef.current === token) {
      setRunningLocalId(null);
      onToast(`Macro "${macro.name}" completed`);
    }
  };

  const runEsp = (id: string) => {
    if (runningLocalId !== null || busyEspId !== null) return;
    setBusyEspId(id);
    vibrate(14);
    conn.send({ t: 'macro_run', id });
    setTimeout(() => setBusyEspId((b) => (b === id ? null : b)), 10000);
  };

  const pushToEsp = (name: string, steps: MacroStep[]): boolean => {
    const check = validateForEsp(name, steps);
    if (!check.ok) {
      onToast(check.reason, 'error');
      return false;
    }
    const existsOnEsp = espMacros.includes(check.espId);
    if (!existsOnEsp && espMacros.length >= 12) {
      onToast('ESP storage full (12/12 macros). Delete one from ESP first.', 'error');
      return false;
    }
    conn.send({ t: 'macro_save', id: check.espId, steps });
    vibrate(12);
    onToast(`Also saved to ESP as "${check.espId}"`);
    return true;
  };

  const removeLocal = (id: string, name: string) => {
    const key = `local:${id}`;
    if (confirmDel !== key) {
      setConfirmDel(key);
      vibrate([10, 30, 10]);
      return;
    }
    setConfirmDel(null);
    deleteMacro(id);
    onToast(`Macro "${name}" deleted`);
  };

  const removeEsp = (id: string) => {
    const key = `esp:${id}`;
    if (confirmDel !== key) {
      setConfirmDel(key);
      vibrate([10, 30, 10]);
      return;
    }
    setConfirmDel(null);
    conn.send({ t: 'macro_del', id });
    onToast(`ESP macro "${id}" deleted`);
  };

  const handleSaveLocal = (alsoPushEsp: boolean) => {
    if (!editing) return;
    const saved = upsertMacro(editing);
    vibrate(12);
    if (alsoPushEsp) {
      if (!pushToEsp(saved.name, saved.steps)) return;
    } else {
      onToast(`Macro "${saved.name}" saved on phone`);
    }
    setEditing(null);
    setEditMode(false);
  };

  const handleExport = () => {
    if (localMacros.length === 0) return;
    const json = exportMacrosJson(localMacros);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pocket-hid-macros.json';
    a.click();
    URL.revokeObjectURL(url);
    onToast(`Exported ${localMacros.length} macro(s) to JSON`);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseMacrosJson(text);
      if (parsed.length === 0) {
        onToast('No valid macros found in JSON file', 'error');
        return;
      }
      const n = importMacros(parsed);
      vibrate(12);
      onToast(`Imported ${n} macro(s) to phone`);
    } catch {
      onToast('Invalid JSON file', 'error');
    }
  };

  if (editing) {
    return (
      <MacroEditor
        editing={editing}
        espCount={espMacros.length}
        espIds={espMacros}
        onChange={setEditing}
        onSaveLocal={() => handleSaveLocal(false)}
        onSaveEsp={() => handleSaveLocal(true)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const hasAny = localMacros.length > 0 || espMacros.length > 0;

  return (
    <div className="macro-screen">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          void handleImportFile(f);
        }}
      />

      <div className="macro-head">
        <div>
          <h2>Macros</h2>
          <span className="muted-sm">
            {localMacros.length} on phone
            {espMacros.length > 0 ? ` · ${espMacros.length}/12 on ESP` : ''}
          </span>
        </div>
        <div className="macro-head-actions">
          {hasAny && (
            <button
              type="button"
              className={`btn-secondary sm ${editMode ? 'active' : ''}`}
              onClick={() => {
                setEditMode((e) => !e);
                setConfirmDel(null);
              }}
            >
              {editMode ? 'Done' : 'Manage'}
            </button>
          )}
          <button
            type="button"
            className="btn-primary sm"
            onClick={() => {
              setEditMode(false);
              setEditing({ name: '', steps: [] });
            }}
          >
            <IconPlus size={16} />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* JSON import / export bar */}
      <div className="macro-io-bar">
        <button
          type="button"
          className="btn-secondary sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Import JSON
        </button>
        {localMacros.length > 0 && (
          <button
            type="button"
            className="btn-secondary sm"
            onClick={handleExport}
          >
            Export JSON
          </button>
        )}
      </div>

      {localMacros.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <IconMacro size={28} />
          </div>
          <h3>No macros on phone</h3>
          <p className="muted">
            Macros are stored locally on your phone (without using ESP flash). Create one here or import a JSON file.
          </p>
          <div className="macro-empty-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing({ name: '', steps: [] })}
            >
              <IconPlus size={17} />
              <span>Create macro</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Import JSON
            </button>
          </div>
        </div>
      ) : (
        <div className="macro-grid">
          {localMacros.map((m) => {
            const isRunning = runningLocalId === m.id;
            const isConfirming = confirmDel === `local:${m.id}`;

            if (editMode) {
              return (
                <div key={m.id} className="macro-card editing">
                  <div>
                    <span className="macro-card-title">{m.name}</span>
                    <div className="macro-card-sub">{m.steps.length} {m.steps.length === 1 ? 'step' : 'steps'}</div>
                  </div>
                  <div className="macro-card-tools">
                    <button
                      type="button"
                      className="btn-secondary sm"
                      onClick={() => {
                        setConfirmDel(null);
                        setEditing({ id: m.id, name: m.name, steps: [...m.steps] });
                      }}
                    >
                      <IconEdit size={15} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary sm"
                      title="Save a copy to ESP32 storage"
                      onClick={() => pushToEsp(m.name, m.steps)}
                    >
                      → ESP
                    </button>
                    <button
                      type="button"
                      className={`btn-danger sm ${isConfirming ? 'armed' : ''}`}
                      onClick={() => removeLocal(m.id, m.name)}
                    >
                      <IconTrash size={15} />
                      <span>{isConfirming ? 'Sure?' : ''}</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={m.id}
                type="button"
                className={`macro-card ${isRunning ? 'running' : ''}`}
                disabled={(runningLocalId !== null && !isRunning) || busyEspId !== null}
                onClick={() => void runLocal(m)}
              >
                <span className="macro-card-icon">
                  <IconMacro size={18} />
                </span>
                <span className="macro-card-title">{m.name}</span>
                <span className="macro-card-sub">
                  {isRunning ? 'Running · tap to stop' : `${m.steps.length} ${m.steps.length === 1 ? 'step' : 'steps'}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Optional section: macros stored in ESP NVS */}
      {espMacros.length > 0 && (
        <section className="macro-esp-section">
          <div className="macro-section-head">
            <span>Saved on ESP</span>
            <span className="muted-sm">{espMacros.length} / 12 (NVS)</span>
          </div>
          <div className="macro-grid">
            {espMacros.map((id) => {
              const isRunning = busyEspId === id;
              const isConfirming = confirmDel === `esp:${id}`;

              if (editMode) {
                return (
                  <div key={id} className="macro-card editing">
                    <span className="macro-card-title">{id}</span>
                    <div className="macro-card-tools">
                      <button
                        type="button"
                        className="btn-secondary sm"
                        onClick={() => {
                          pullingEspRef.current = id;
                          conn.send({ t: 'macro_get', id });
                        }}
                      >
                        → Phone
                      </button>
                      <button
                        type="button"
                        className={`btn-danger sm ${isConfirming ? 'armed' : ''}`}
                        onClick={() => removeEsp(id)}
                      >
                        <IconTrash size={15} />
                        <span>{isConfirming ? 'Sure?' : ''}</span>
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
                  disabled={runningLocalId !== null || busyEspId !== null}
                  onClick={() => runEsp(id)}
                >
                  <span className="macro-card-icon esp">
                    <IconMacro size={18} />
                  </span>
                  <span className="macro-card-title">{id}</span>
                  <span className="macro-card-sub">
                    {isRunning ? 'Running on ESP…' : 'On ESP · tap to run'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MacroEditor({
  editing,
  espCount,
  espIds,
  onChange,
  onSaveLocal,
  onSaveEsp,
  onCancel,
}: {
  editing: Editing;
  espCount: number;
  espIds: string[];
  onChange: (e: Editing) => void;
  onSaveLocal: () => void;
  onSaveEsp: () => void;
  onCancel: () => void;
}) {
  const [stepType, setStepType] = useState<StepType>('key');
  const [keyIdx, setKeyIdx] = useState(0);
  const [mods, setMods] = useState(0);
  const [text, setText] = useState('');
  const [wait, setWait] = useState(500);
  const [mediaIdx, setMediaIdx] = useState(0);

  const pushStep = (step: MacroStep) => {
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

  const nameOk = editing.name.trim().length > 0;
  const canSaveLocal = nameOk && editing.steps.length > 0;
  const espCheck = validateForEsp(editing.name || 'macro', editing.steps);
  const espFull = espCheck.ok && !espIds.includes(espCheck.espId) && espCount >= 12;
  const canSaveEsp = canSaveLocal && espCheck.ok && !espFull;

  return (
    <div className="macro-editor">
      <div className="macro-head">
        <h2>{editing.id ? `Edit: ${editing.name}` : 'New macro'}</h2>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel">
          <IconClose size={20} />
        </button>
      </div>

      <label className="field">
        <span>Macro name</span>
        <input
          type="text"
          value={editing.name}
          onChange={(e) => onChange({ ...editing, name: e.target.value })}
          placeholder="e.g. Terminal + top, Lock PC, Netflix"
          maxLength={60}
        />
      </label>

      {/* Quick insert */}
      <div className="editor-card">
        <div className="editor-card-head">
          <span>Add step</span>
          <span className="muted-sm">{editing.steps.length} {editing.steps.length === 1 ? 'step' : 'steps'}</span>
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
            ['key', 'Key'],
            ['text', 'Text'],
            ['media', 'Media'],
            ['wait', 'Wait'],
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
              placeholder="Text to type (ASCII)"
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
            <span>Add step</span>
          </button>
        </div>
      </div>

      {/* Step list */}
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
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="step-btn"
                disabled={i === editing.steps.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="step-btn danger"
                onClick={() => removeStep(i)}
                aria-label="Remove step"
              >
                ✕
              </button>
            </span>
          </li>
        ))}
        {editing.steps.length === 0 && (
          <li className="macro-step-empty">No steps yet: add at least one above.</li>
        )}
      </ol>

      <div className="macro-editor-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canSaveEsp}
          title={
            !espCheck.ok
              ? espCheck.reason
              : espFull
                ? 'ESP storage full (12/12)'
                : `Save on phone and copy to ESP as "${espCheck.espId}"`
          }
          onClick={onSaveEsp}
        >
          + Save to ESP
        </button>
        <button type="button" className="btn-primary" disabled={!canSaveLocal} onClick={onSaveLocal}>
          Save on phone
        </button>
      </div>
    </div>
  );
}
