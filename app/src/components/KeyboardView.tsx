import { useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { K, MOD } from '../protocol/hid';
import { countNonAscii, transliterateAscii, type Prefs } from '../hooks/usePrefs';
import { IconBackspace, IconChevron, IconReturn, IconSend } from './Icons';

interface Props {
  conn: DeviceLink;
  prefs: Prefs;
  vibrate: (p?: number | number[]) => void;
}

type PadTab = 'nav' | 'fn' | 'qwerty';
type InputMode = 'phrase' | 'live';

interface KeyDef {
  label: string;
  code: number;
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
  { label: 'Copia', code: K.C, mods: MOD.CTRL },
  { label: 'Incolla', code: K.V, mods: MOD.CTRL },
  { label: 'Taglia', code: K.X, mods: MOD.CTRL },
  { label: 'Annulla', code: K.Z, mods: MOD.CTRL },
  { label: 'Tutto', code: K.A, mods: MOD.CTRL },
  { label: 'Alt+Tab', code: K.TAB, mods: MOD.ALT },
  { label: 'Alt+F4', code: K.F4, mods: MOD.ALT },
];

const NAV_EXTRA: KeyDef[] = [
  { label: 'Home', code: K.HOME },
  { label: 'Fine', code: K.END },
  { label: 'PgSu', code: K.PAGEUP },
  { label: 'PgGiù', code: K.PAGEDOWN },
  { label: 'Ins', code: K.INSERT },
  { label: 'Stamp', code: K.PRINTSCREEN },
  { label: '⇪ Caps', code: K.CAPSLOCK },
  { label: 'Pausa', code: K.PAUSE },
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

export function KeyboardView({ conn, prefs, vibrate }: Props) {
  const [inputMode, setInputMode] = useState<InputMode>('phrase');
  const [text, setText] = useState('');
  const [padTab, setPadTab] = useState<PadTab>('nav');

  // Modificatori: 1 tap = one-shot (sticky), doppio tap = bloccato (locked)
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
    // Rilascia solo i modificatori one-shot (non quelli bloccati)
    if (mods !== lockedMods) setMods(lockedMods);
  };

  const sendTextPayload = (raw: string, withEnter = false) => {
    const payload = prefs.transliterate ? transliterateAscii(raw) : raw;
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
      {/* Sezione tastiera nativa / invio testo */}
      <section className="type-card">
        <div className="type-card-head">
          <span className="type-label">Tastiera del telefono</span>
          <div className="mini-seg" role="tablist" aria-label="Modalità scrittura">
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
              Frase
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
                ? 'Digita qui per inviare in tempo reale…'
                : 'Scrivi, detta o incolla una frase…'
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
              <span>Invia</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handlePhraseSend(true)}
            >
              <IconReturn size={16} />
              <span>{text ? 'Invia + ↵' : 'Invio'}</span>
            </button>
          </div>
        )}

        {nonAscii > 0 && (
          <p className="type-note">
            {prefs.transliterate
              ? `Accenti convertiti in ASCII${remainingDropped > 0 ? ' (emoji ignorate)' : ''}.`
              : `⚠ ${nonAscii} carattere/i non ASCII verranno saltati dal firmware.`}
          </p>
        )}
      </section>

      {/* Modificatori sticky / bloccabili */}
      <div className="kb-mods" role="group" aria-label="Modificatori">
        {MOD_KEYS.map((m) => {
          const isLocked = Boolean(lockedMods & m.id);
          const isActive = Boolean(mods & m.id) || isLocked;
          return (
            <button
              key={m.id}
              type="button"
              className={`key mod ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
              onClick={() => toggleMod(m.id)}
              title="Tap: singolo · Doppio tap: blocca"
            >
              <span>{m.label}</span>
              {isLocked && <span className="mod-lock-dot" aria-label="bloccato" />}
            </button>
          );
        })}
      </div>

      {/* Scorciatoie rapide scorrevoli */}
      <div className="shortcut-strip" role="group" aria-label="Scorciatoie rapide">
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

      {/* Selettore tastierino mobile */}
      <div className="segmented compact" role="tablist" aria-label="Sezione tasti">
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'nav'}
          className={`seg-btn ${padTab === 'nav' ? 'active' : ''}`}
          onClick={() => setPadTab('nav')}
        >
          Nav &amp; Frecce
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={padTab === 'fn'}
          className={`seg-btn ${padTab === 'fn' ? 'active' : ''}`}
          onClick={() => setPadTab('fn')}
        >
          F1 – F12
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
      </div>

      {/* Pannello attivo */}
      {padTab === 'nav' && (
        <div className="kb-panel">
          <div className="arrow-pad">
            <div />
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.UP)} aria-label="Su">
              <IconChevron dir="up" size={22} />
            </button>
            <div />
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.LEFT)} aria-label="Sinistra">
              <IconChevron dir="left" size={22} />
            </button>
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.DOWN)} aria-label="Giù">
              <IconChevron dir="down" size={22} />
            </button>
            <button type="button" className="key arrow-key" onClick={() => tapKey(K.RIGHT)} aria-label="Destra">
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
              Spazio
            </button>
            <button type="button" className="key accent-key" style={{ flex: 1.2 }} onClick={() => tapKey(K.ENTER)}>
              Invio ↵
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
            <button type="button" className="key accent-key" onClick={() => tapKey(K.ENTER)}>Invio ↵</button>
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
              Spazio
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
