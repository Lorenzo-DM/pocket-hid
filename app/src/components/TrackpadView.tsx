import { useEffect, useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { K } from '../protocol/hid';
import { transliterateAscii, type Prefs } from '../hooks/usePrefs';
import { IconBackspace, IconClose, IconKeyboard, IconReturn, IconSend } from './Icons';

interface Props {
  conn: DeviceLink;
  prefs: Prefs;
  vibrate: (p?: number | number[]) => void;
}

// Mobile-first trackpad:
//  - 1 finger on pad: relative movement (sensitivity from prefs)
//  - right edge rail: 1-finger vertical scroll (one-handed use)
//  - short 1-finger tap: left click · double tap + hold: drag
//  - short 2-finger tap or stationary long-press (>550ms): right click
//  - 2-finger drag: scroll
//  - inline "Quick type" bar to type immediately without switching tabs

const SCROLL_BASE_DIV = 12;
const TAP_MAX_MS = 240;
const TAP_MAX_PX = 12;
const DOUBLE_TAP_MS = 280;
const LONGPRESS_MS = 550;
const CLAMP = 120;

interface PointerState {
  startT: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

export function TrackpadView({ conn, prefs, vibrate }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const pointers = useRef(new Map<number, PointerState>());
  const railPointer = useRef<{ id: number; lastY: number } | null>(null);
  const moveAcc = useRef({ x: 0, y: 0 });
  const scrollAcc = useRef({ x: 0, y: 0 });
  const rafId = useRef(0);
  const totalMove = useRef(0);
  const maxFingers = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const lastTapTime = useRef(0);
  const tapDragActive = useRef(false);

  const [padFeedback, setPadFeedback] = useState<'idle' | 'active' | 'drag'>('idle');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickText, setQuickText] = useState('');

  const sendClamped = (acc: { x: number; y: number }, type: 'mouse' | 'scroll') => {
    const dx = Math.max(-CLAMP, Math.min(CLAMP, Math.round(acc.x)));
    const dy = Math.max(-CLAMP, Math.min(CLAMP, Math.round(acc.y)));
    if (dx === 0 && dy === 0) return false;
    acc.x -= dx;
    acc.y -= dy;
    conn.send({ t: type, dx, dy });
    return true;
  };

  const pump = () => {
    const sentMove = sendClamped(moveAcc.current, 'mouse');
    const sentScroll = sendClamped(scrollAcc.current, 'scroll');
    if (pointers.current.size > 0 || railPointer.current || sentMove || sentScroll) {
      rafId.current = requestAnimationFrame(pump);
    } else {
      rafId.current = 0;
    }
  };

  const ensurePump = () => {
    if (rafId.current === 0) rafId.current = requestAnimationFrame(pump);
  };

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (tapDragActive.current) conn.send({ t: 'mbtn', b: 0, act: 'u' });
    };
  }, [conn]);

  useEffect(() => {
    if (quickOpen) quickInputRef.current?.focus();
  }, [quickOpen]);

  const flashPad = () => {
    setPadFeedback('active');
    setTimeout(() => setPadFeedback((cur) => (cur === 'active' ? 'idle' : cur)), 140);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const fireRightClick = () => {
    longPressFired.current = true;
    conn.send({ t: 'mbtn', b: 1, act: 'c' });
    vibrate([12, 30, 12]);
    flashPad();
  };

  const fireLeftClick = () => {
    conn.send({ t: 'mbtn', b: 0, act: 'c' });
    vibrate(10);
    flashPad();
  };

  // ---- Main trackpad surface events ----

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointers.current.size >= 2) return;
    padRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {
      startT: e.timeStamp,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    });
    maxFingers.current = Math.max(maxFingers.current, pointers.current.size);

    if (pointers.current.size === 1) {
      totalMove.current = 0;
      longPressFired.current = false;
      maxFingers.current = 1;

      // Double tap + hold -> 1-finger drag & drop
      if (e.timeStamp - lastTapTime.current <= DOUBLE_TAP_MS) {
        tapDragActive.current = true;
        conn.send({ t: 'mbtn', b: 0, act: 'd' });
        vibrate(14);
        setPadFeedback('drag');
      } else {
        longPressTimer.current = setTimeout(fireRightClick, LONGPRESS_MS);
      }
    } else {
      cancelLongPress();
      if (tapDragActive.current) {
        tapDragActive.current = false;
        conn.send({ t: 'mbtn', b: 0, act: 'u' });
        setPadFeedback('idle');
      }
    }
    ensurePump();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;

    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    totalMove.current += Math.abs(dx) + Math.abs(dy);
    if (totalMove.current > TAP_MAX_PX) cancelLongPress();

    const { sensitivity, scrollSpeed, naturalScroll } = prefs;

    if (pointers.current.size === 1) {
      moveAcc.current.x += dx * sensitivity;
      moveAcc.current.y += dy * sensitivity;
    } else if (pointers.current.size === 2) {
      const dir = naturalScroll ? 1 : -1;
      const div = SCROLL_BASE_DIV / scrollSpeed;
      scrollAcc.current.x += (dx * dir) / div;
      scrollAcc.current.y += (dy * dir) / div;
    }
    ensurePump();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    pointers.current.delete(e.pointerId);
    cancelLongPress();

    if (tapDragActive.current && pointers.current.size === 0) {
      tapDragActive.current = false;
      conn.send({ t: 'mbtn', b: 0, act: 'u' });
      setPadFeedback('idle');
      lastTapTime.current = 0;
      return;
    }

    const duration = e.timeStamp - p.startT;
    if (pointers.current.size === 0 && !longPressFired.current && duration <= TAP_MAX_MS && totalMove.current <= TAP_MAX_PX) {
      if (maxFingers.current === 2) {
        fireRightClick();
        lastTapTime.current = 0;
      } else {
        fireLeftClick();
        lastTapTime.current = e.timeStamp;
      }
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    cancelLongPress();
    if (tapDragActive.current && pointers.current.size === 0) {
      tapDragActive.current = false;
      conn.send({ t: 'mbtn', b: 0, act: 'u' });
      setPadFeedback('idle');
    }
  };

  // ---- 1-finger scroll rail on right edge ----

  const onRailDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    railRef.current?.setPointerCapture(e.pointerId);
    railPointer.current = { id: e.pointerId, lastY: e.clientY };
    ensurePump();
  };

  const onRailMove = (e: React.PointerEvent) => {
    if (!railPointer.current || railPointer.current.id !== e.pointerId) return;
    e.stopPropagation();
    const dy = e.clientY - railPointer.current.lastY;
    railPointer.current.lastY = e.clientY;
    const { scrollSpeed, naturalScroll } = prefs;
    const dir = naturalScroll ? 1 : -1;
    const div = (SCROLL_BASE_DIV * 0.85) / scrollSpeed;
    scrollAcc.current.y += (dy * dir) / div;
    ensurePump();
  };

  const onRailUp = (e: React.PointerEvent) => {
    if (railPointer.current?.id === e.pointerId) {
      e.stopPropagation();
      railPointer.current = null;
    }
  };

  // ---- Physical L / M / R buttons ----

  const buttonHandlers = (b: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      conn.send({ t: 'mbtn', b, act: 'd' });
      vibrate(10);
      setPadFeedback('drag');
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      conn.send({ t: 'mbtn', b, act: 'u' });
      setPadFeedback('idle');
    },
    onPointerCancel: () => {
      conn.send({ t: 'mbtn', b, act: 'u' });
      setPadFeedback('idle');
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  // ---- Quick type bar ----

  const sendQuick = (withEnter: boolean) => {
    const payload = prefs.transliterate ? transliterateAscii(quickText) : quickText;
    if (payload) {
      conn.send({ t: 'text', s: payload });
    }
    if (withEnter) {
      conn.send({ t: 'key', code: K.ENTER, mods: 0, act: 't' });
    }
    if (payload || withEnter) {
      vibrate(10);
      setQuickText('');
    }
  };

  return (
    <div className="trackpad">
      {quickOpen ? (
        <form
          className="quick-type-bar"
          onSubmit={(e) => {
            e.preventDefault();
            sendQuick(true);
          }}
        >
          <input
            ref={quickInputRef}
            type="text"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="Quick type…"
            autoComplete="off"
          />
          <button
            type="button"
            className="qt-btn"
            onClick={() => {
              conn.send({ t: 'key', code: K.BACKSPACE, mods: 0, act: 't' });
              vibrate(8);
            }}
            aria-label="Backspace"
            title="Backspace"
          >
            <IconBackspace size={18} />
          </button>
          <button
            type="button"
            className="qt-btn"
            disabled={!quickText}
            onClick={() => sendQuick(false)}
            aria-label="Send text"
            title="Send"
          >
            <IconSend size={17} />
          </button>
          <button
            type="submit"
            className="qt-btn primary"
            aria-label="Send and press Enter"
            title="Send + Enter"
          >
            <IconReturn size={18} />
          </button>
          <button
            type="button"
            className="qt-btn ghost"
            onClick={() => setQuickOpen(false)}
            aria-label="Close quick type"
          >
            <IconClose size={18} />
          </button>
        </form>
      ) : (
        <div className="trackpad-toolbar">
          <button
            type="button"
            className="quick-trigger"
            onClick={() => setQuickOpen(true)}
          >
            <IconKeyboard size={16} />
            <span>Quick type…</span>
          </button>
        </div>
      )}

      <div className={`pad-shell ${padFeedback}`}>
        <div
          ref={padRef}
          className="pad-surface"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="pad-hint">
            {padFeedback === 'drag'
              ? 'Dragging'
              : 'Tap: left · 2-finger/hold: right · 2× tap: drag'}
          </span>
        </div>

        <div
          ref={railRef}
          className="scroll-rail"
          aria-label="Scroll bar"
          onPointerDown={onRailDown}
          onPointerMove={onRailMove}
          onPointerUp={onRailUp}
          onPointerCancel={onRailUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="scroll-rail-grip" aria-hidden="true" />
        </div>
      </div>

      <div className="pad-buttons">
        <button type="button" className="pad-btn" {...buttonHandlers(0)}>
          Left click
        </button>
        <button
          type="button"
          className="pad-btn middle"
          aria-label="Middle click"
          title="Middle click"
          {...buttonHandlers(2)}
        >
          •
        </button>
        <button type="button" className="pad-btn" {...buttonHandlers(1)}>
          Right click
        </button>
      </div>
    </div>
  );
}
