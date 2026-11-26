import { useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { K, MOD } from '../protocol/hid';
import { countNonAscii, transliterateAscii, type Prefs } from '../hooks/usePrefs';
import { IconBackspace, IconChevron, IconReturn, IconSend } from './Icons';

interface Props {
  conn: DeviceLink;
  prefs: Prefs;
  layout: string;
  vibrate: (p?: number | number[]) => void;
}

type PadTab = 'nav' | 'fn' | 'qwerty' | 'symbols';
type InputMode = 'phrase' | 'live';

interface KeyDef {
  label: string;
  code: number;
  mods?: number;
  wide?: number;
}

const MOD_KEYS: { id: number; label: string }[] = [
  { id: MOD.CTRL, label: 'Ctrl' },
  { id: MOD.ALT, label: 'Alt' },
  { id: MOD.GUI, label: 'Win' },
  { id: MOD.SHIFT, label: 'Shift' },
];

const QUICK_SHORTCUTS: { label: string; code: number; mods?: number }[] = [
  { label: '⊞ Win', code: 0, mods: MOD.GUI },
  { label: 'Esc', code: K.ESC },
  { label: 'Tab', code: K.TAB },
  { label: 'Del', code: K.DELETE },
  { label: 'Copy', code: K.C, mods: MOD.CTRL },
  { label: 'Paste', code: K.V, mods: MOD.CTRL },
  { label: 'Cut', code: K.X, mods: MOD.CTRL },
  { label: 'Undo', code: K.Z, mods: MOD.CTRL },
  { label: 'Select All', code: K.A, mods: MOD.CTRL },
  { label: 'Alt+Tab', code: K.TAB, mods: MOD.ALT },
  { label: 'Alt+F4', code: K.F4, mods: MOD.ALT },
];

const NAV_EXTRA: KeyDef[] = [
  { label: 'Home', code: K.HOME },
  { label: 'End', code: K.END },
  { label: 'PgUp', code: K.PAGEUP },
  { label: 'PgDn', code: K.PAGEDOWN },
  { label: 'Ins', code: K.INSERT },
  { label: 'PrtSc', code: K.PRINTSCREEN },
  { label: '⇪ Caps', code: K.CAPSLOCK },
  { label: 'Pause', code: K.PAUSE },
];

const FN_KEYS: KeyDef[] = Array.from({ length: 12 }, (_, i) => ({
  label: `F${i + 1}`,
  code: K.F1 + i,
}));

const QWERTY_ROWS: KeyDef[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((label, i) => ({
    label,
    code: K.N1 + i,
  })),
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((l) => ({
    label: l,
    code: K[l as keyof typeof K],
  })),
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'].map((l) => ({
    label: l,
    code: K[l as keyof typeof K],
  })),
  [
    ...['Z', 'X', 'C', 'V', 'B', 'N', 'M'].map((l) => ({
      label: l,
      code: K[l as keyof typeof K],
    })),
    { label: '⌫', code: K.BACKSPACE, wide: 1.6 },
  ],
];

const SYMBOL_ROWS_US: KeyDef[][] = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'].map((label, i) => ({
    label,
    code: K.N1 + i,
    mods: MOD.SHIFT,
  })),
  [
    { label: '-', code: K.MINUS },
    { label: '_', code: K.MINUS, mods: MOD.SHIFT },
    { label: '=', code: K.EQUAL },
    { label: '+', code: K.EQUAL, mods: MOD.SHIFT },
    { label: '[', code: K.LBRACKET },
    { label: ']', code: K.RBRACKET },
    { label: '{', code: K.LBRACKET, mods: MOD.SHIFT },
    { label: '}', code: K.RBRACKET, mods: MOD.SHIFT },
  ],
  [
    { label: '\\', code: K.BACKSLASH },
    { label: '|', code: K.BACKSLASH, mods: MOD.SHIFT },
    { label: ';', code: K.SEMICOLON },
    { label: ':', code: K.SEMICOLON, mods: MOD.SHIFT },
    { label: "'", code: K.QUOTE },
    { label: '"', code: K.QUOTE, mods: MOD.SHIFT },
    { label: '`', code: K.GRAVE },
    { label: '~', code: K.GRAVE, mods: MOD.SHIFT },
  ],
  [
    { label: ',', code: K.COMMA },
    { label: '.', code: K.DOT },
    { label: '<', code: K.COMMA, mods: MOD.SHIFT },
    { label: '>', code: K.DOT, mods: MOD.SHIFT },
    { label: '/', code: K.SLASH },
    { label: '?', code: K.SLASH, mods: MOD.SHIFT },
    { label: '⌫', code: K.BACKSPACE, wide: 1.6 },
  ],
];

const SYMBOL_ROWS_IT: KeyDef[][] = [
  [
    { label: '!', code: K.N1, mods: MOD.SHIFT },
    { label: '@', code: K.SEMICOLON, mods: MOD.ALTGR },
    { label: '#', code: K.QUOTE, mods: MOD.ALTGR },
    { label: '$', code: K.N4, mods: MOD.SHIFT },
    { label: '%', code: K.N5, mods: MOD.SHIFT },
    { label: '^', code: K.EQUAL, mods: MOD.SHIFT },
    { label: '&', code: K.N6, mods: MOD.SHIFT },
    { label: '*', code: K.RBRACKET, mods: MOD.SHIFT },
    { label: '(', code: K.N8, mods: MOD.SHIFT },
    { label: ')', code: K.N9, mods: MOD.SHIFT },
  ],
  [
    { label: '-', code: K.SLASH },
    { label: '_', code: K.SLASH, mods: MOD.SHIFT },
    { label: '=', code: K.N0, mods: MOD.SHIFT },
    { label: '+', code: K.RBRACKET },
    { label: '[', code: K.LBRACKET, mods: MOD.ALTGR },
    { label: ']', code: K.RBRACKET, mods: MOD.ALTGR },
    { label: '{', code: K.LBRACKET, mods: MOD.SHIFT | MOD.ALTGR },
    { label: '}', code: K.RBRACKET, mods: MOD.SHIFT | MOD.ALTGR },
  ],
  [
    { label: '\\', code: K.GRAVE },
    { label: '|', code: K.GRAVE, mods: MOD.SHIFT },
    { label: ';', code: K.COMMA, mods: MOD.SHIFT },
    { label: ':', code: K.DOT, mods: MOD.SHIFT },
    { label: "'", code: K.MINUS },
    { label: '"', code: K.N2, mods: MOD.SHIFT },
    { label: '`', code: K.MINUS, mods: MOD.ALTGR },
    { label: '~', code: K.EQUAL, mods: MOD.ALTGR },
  ],
  [
    { label: ',', code: K.COMMA },
    { label: '.', code: K.DOT },
    { label: '<', code: K.ISO },
    { label: '>', code: K.ISO, mods: MOD.SHIFT },
    { label: '/', code: K.N7, mods: MOD.SHIFT },
    { label: '?', code: K.MINUS, mods: MOD.SHIFT },
    { label: '⌫', code: K.BACKSPACE, wide: 1.6 },
  ],
];

export function KeyboardView({ conn, prefs, layout, vibrate }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('phrase');
  const [text, setText] = useState('');
  const [padTab, setPadTab] = useState<PadTab>('nav');

  // Modifiers: 1 tap = one-shot (sticky), double tap = locked
  const [mods, setMods] = useState(0);
  const [lockedMods, setLockedMods] = useState(0);
  const lastModTap = useRef<{ id: number; t: number }>({ id: 0, t: 0 });
  const composingRef = useRef(false);

  const toggleMod = (id: number) => {
    vibrate(8);
    const now = performance.now();
    const isDouble = lastModTap.current.id === id && now - lastModTap.current.t < 350;
    lastModTap.current = { id, t: now };

    if (lockedMods & id) {
      setLockedMods((prev) => prev & ~id);
      setMods((prev) => prev & ~id);
      return;
    }
    if ((mods & id) && isDouble) {
      setLockedMods((prev) => prev | id);
      return;
    }
    setMods((prev) => prev ^ id);
  };

  const tapKey = (code: number, extraMods = 0) => {
    const activeMods = mods | lockedMods | extraMods;
    conn.send({ t: 'key', code, mods: activeMods, act: 't' });
    vibrate(10);
    // Release only one-shot modifiers (keep locked ones)
    if (mods !== lockedMods) setMods(lockedMods);
  };

  const isIt = layout === 'it';
  const symbolRows = isIt ? SYMBOL_ROWS_IT : SYMBOL_ROWS_US;

  const sendTextPayload = (raw: string, withEnter = false) => {
    const payload = !isIt && prefs.transliterate ? transliterateAscii(raw) : raw;
    if (payload) conn.send({ t: 'text', s: payload });
    if (withEnter) conn.send({ t: 'key', code: K.ENTER, mods: 0, act: 't' });
    if (payload || withEnter) vibrate(10);
  };

  const handlePhraseSend = (withEnter: boolean) => {
    if (!text && !withEnter) return;
    sendTextPayload(text, withEnter);
    setText('');
  };

  const flushLive = (val: string) => {
    if (!val) return;
    sendTextPayload(val, false);
    setText('');
  };

  const nonAscii = countNonAscii(text);
  const adaptedPreview = prefs.transliterate && nonAscii > 0 ? transliterateAscii(text) : '';
  const remainingDropped =
    prefs.transliterate && nonAscii > 0
      ? [...text].filter((ch) => ch.codePointAt(0)! > 0x7e).length -
        Math.max(0, adaptedPreview.length - (text.length - nonAscii))
      : nonAscii;

  return (
    <div className="keyboard-screen">
      {/* Native phone keyboard / text input section */}
      <section className="type-card">
        <div className="type-card-head">
          <span className="type-label">Phone keyboard</span>
          <div className="mini-seg" role="tablist" aria-label="Input mode">
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'phrase'}
              className={inputMode === 'phrase' ? 'active' : ''}
              onClick={() => {
                setInputMode('phrase');
                setText('');
              }}
            >
              Phrase
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === 'live'}
              className={inputMode === 'live' ? 'active' : ''}
              onClick={() => {
                setInputMode('live');
                setText('');
              }}
            >
              Live
            </button>
          </div>
        </div>

        <div className="type-input-row">
          <input
            type="text"
            value={text}
            placeholder={
              inputMode === 'live'
                ? 'Type here to send in real time…'
                : 'Type, dictate, or paste a phrase…'
            }
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              if (inputMode === 'live') flushLive(e.currentTarget.value);
            }}
            onChange={(e) => {
              const val = e.target.value;
              if (inputMode === 'live' && !composingRef.current) {
                flushLive(val);
              } else {
                setText(val);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (inputMode === 'live') {
                  if (text) flushLive(text);
                  tapKey(K.ENTER);
                } else {
                  handlePhraseSend(true);
                }
              } else if (e.key === 'Backspace' && inputMode === 'live' && text === '') {
                e.preventDefault();
                tapKey(K.BACKSPACE);
              }
            }}
          />
          <button
            type="button"
            className="qt-btn"
            onClick={() => tapKey(K.BACKSPACE)}
            aria-label="Backspace"
            title="Backspace"
          >
            <IconBackspace size={18} />
          </button>
        </div>

        {inputMode === 'phrase' && (
          <div className="type-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={!text}
              onClick={() => handlePhraseSend(false)}
            >
              <IconSend size={16} />
              <span>Send</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handlePhraseSend(true)}
            >
              <IconReturn size={16} />
              <span>{text ? 'Send + ↵' : 'Enter'}</span>
            </button>
          </div>
        )}

        {!isIt && nonAscii > 0 && (
          <p className="type-note">
            {prefs.transliterate
              ? `Accents converted to ASCII${remainingDropped > 0 ? ' (emoji skipped)' : ''}.`
              : `⚠ ${nonAscii} non-ASCII character(s) will be skipped by firmware (US layout).`}
          </p>
        )}
      </section>

      {/* Sticky / lockable modifiers */}
      <div className="kb-mods" role="group" aria-label="Modifiers">
        {MOD_KEYS.map((m) => {
          const isLocked = Boolean(lockedMods & m.id);
          const isActive = Boolean(mods & m.id) || isLocked;
          return (
            <button
              key={m.id}
              type="button"
              className={`key mod ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => toggleMod(m.id)}
              title="Tap: one-shot · Double tap: lock"
            >
              <span>{m.label}</span>
              {isLocked && <span className="mod-lock-dot" aria-label="locked" />}
            </button>
          );
        })}
      </div>

      {/* Scrollable quick shortcuts */}
      <div className="shortcut-strip" role="group" aria-label="Quick shortcuts">
        {QUICK_SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="shortcut-pill"
            onClick={() => tapKey(s.code, s.mods ?? 0)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Keypad section selector */}
      <div className="segmented compact" role="tablist" aria-label="Key section">
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'nav'}
          className={`seg-btn ${padTab === 'nav' ? 'active' : ''}`}
          onClick={() => setPadTab('nav')}
        >
          Arrows
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'fn'}
          className={`seg-btn ${padTab === 'fn' ? 'active' : ''}`}
          onClick={() => setPadTab('fn')}
        >
          F1–F12
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'qwerty'}
          className={`seg-btn ${padTab === 'qwerty' ? 'active' : ''}`}
          onClick={() => setPadTab('qwerty')}
        >
          QWERTY
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'symbols'}
          className={`seg-btn ${padTab === 'symbols' ? 'active' : ''}`}
          onClick={() => setPadTab('symbols')}
        >
          Symbols
        </button>
      </div>

      {/* Active panel */}
      {padTab === 'nav' && (
        <div className="kb-panel">
          <div className="arrow-pad">
            <div />
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.UP)} aria-label="Up">
              <IconChevron dir="up" size={22} />
            </button>
            <div />
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.LEFT)} aria-label="Left">
              <IconChevron dir="left" size={22} />
            </button>
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.DOWN)} aria-label="Down">
              <IconChevron dir="down" size={22} />
            </button>
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.RIGHT)} aria-label="Right">
              <IconChevron dir="right" size={22} />
            </button>
          </div>

          <div className="key-grid-4">
            {NAV_EXTRA.map((k) => (
              <button key={k.label} type="button" className="key" onClick={() => tapKey(k.code)}>
                {k.label}
              </button>
            ))}
          </div>

          <div className="kb-row">
            <button type="button" className="key" style={{ flex: 2.2 }} onClick={() => tapKey(K.SPACE)}>
              Space
            </button>
            <button type="button" className="key accent-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.ENTER)}>
              Enter ↵
            </button>
          </div>
        </div>
      )}

      {padTab === 'fn' && (
        <div className="kb-panel">
          <div className="key-grid-4">
            {FN_KEYS.map((k) => (
              <button key={k.label} type="button" className="key fn-key" onClick={() => tapKey(k.code)}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="kb-row">
            <button type="button" className="key" onClick={() => tapKey(K.ESC)}>Esc</button>
            <button type="button" className="key" onClick={() => tapKey(K.TAB)}>Tab</button>
            <button type="button" className="key" onClick={() => tapKey(K.DELETE)}>Del</button>
            <button type="button" className="key accent-key" onClick={() => tapKey(K.ENTER)}>Enter ↵</button>
          </div>
        </div>
      )}

      {padTab === 'qwerty' && (
        <div className="kb-panel qwerty-panel">
          {QWERTY_ROWS.map((row, i) => (
            <div className="kb-row tight" key={i}>
              {row.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  className="key qwerty-key"
                  style={k.wide ? { flex: k.wide } : undefined}
                  onClick={() => tapKey(k.code)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          ))}
          <div className="kb-row tight">
            <button type="button" className="key qwerty-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.ESC)}>
              Esc
            </button>
            <button type="button" className="key qwerty-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.TAB)}>
              Tab
            </button>
            <button type="button" className="key qwerty-key" style={{ flex: 3.6 }} onClick={() => tapKey(K.SPACE)}>
              Space
            </button>
            <button type="button" className="key qwerty-key accent-key" style={{ flex: 1.6 }} onClick={() => tapKey(K.ENTER)}>
              ↵
            </button>
          </div>
        </div>
      )}

      {padTab === 'symbols' && (
        <div className="kb-panel qwerty-panel">
          {symbolRows.map((row, i) => (
            <div className="kb-row tight" key={i}>
              {row.map((k) => (
                <button
                  key={k.label}
                  type="button"
                  className="key qwerty-key symbol-key"
                  style={k.wide ? { flex: k.wide } : undefined}
                  onClick={() => tapKey(k.code, k.mods ?? 0)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          ))}
          <div className="kb-row tight">
            <button type="button" className="key qwerty-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.ESC)}>
              Esc
            </button>
            <button type="button" className="key qwerty-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.TAB)}>
              Tab
            </button>
            <button type="button" className="key qwerty-key" style={{ flex: 3.6 }} onClick={() => tapKey(K.SPACE)}>
              Space
            </button>
            <button type="button" className="key qwerty-key accent-key" style={{ flex: 1.6 }} onClick={() => tapKey(K.ENTER)}>
              ↵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
