import { useEffect, useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';

interface Props {
  conn: DeviceLink;
}

// Trackpad touch:
//  - 1 dito: movimento relativo, inviato a ~60Hz (rAF coalescing)
//  - tap breve senza movimento = click sinistro
//  - long-press fermo (>550ms) = click destro
//  - 2 dita: scroll (coalesced sullo stesso loop)
//  - pulsanti fisici sotto: L/R con pressione prolungata = drag
//
// Nota firmware: i delta mouse sono int8_t (±127). Se un frame accumula più di
// quel limite, si invia il massimo e il resto resta nell'accumulatore per il
// frame successivo.

const SENSITIVITY = 1.6; // moltiplicatore delta grezzi -> pixel target
const SCROLL_DIV = 12; // px touch -> tacche scroll
const TAP_MAX_MS = 250;
const TAP_MAX_PX = 12;
const LONGPRESS_MS = 550;
const CLAMP = 120; // margine sotto il limite int8

interface PointerState {
  startT: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
}

export function TrackpadView({ conn }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, PointerState>());
  const moveAcc = useRef({ x: 0, y: 0 });
  const scrollAcc = useRef({ x: 0, y: 0 });
  const rafId = useRef(0);
  const totalMove = useRef(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const [dragging, setDragging] = useState(false); // feedback visivo

  // ---- loop di invio ~60Hz (coalescing) ----

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
    if (pointers.current.size > 0 || sentMove || sentScroll) {
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
    };
  }, []);

  // ---- click / long-press ----

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const rightClick = () => {
    longPressFired.current = true;
    conn.send({ t: 'mbtn', b: 1, act: 'c' });
    setDragging(true);
    setTimeout(() => setDragging(false), 150);
  };

  const tapClick = () => {
    conn.send({ t: 'mbtn', b: 0, act: 'c' });
    setDragging(true);
    setTimeout(() => setDragging(false), 150);
  };

  // ---- eventi pointer ----

  const onPointerDown = (e: React.PointerEvent) => {
    if (pointers.current.size >= 2) return; // max 2 dita
    padRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {
      startT: e.timeStamp,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    });

    if (pointers.current.size === 1) {
      totalMove.current = 0;
      longPressFired.current = false;
      longPressTimer.current = setTimeout(rightClick, LONGPRESS_MS);
    } else {
      cancelLongPress(); // secondo dito: niente long-press nè tap
      longPressFired.current = true;
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

    if (pointers.current.size === 1) {
      moveAcc.current.x += dx * SENSITIVITY;
      moveAcc.current.y += dy * SENSITIVITY;
    } else if (pointers.current.size === 2) {
      scrollAcc.current.x += dx / SCROLL_DIV;
      scrollAcc.current.y += dy / SCROLL_DIV;
    }
    ensurePump();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    pointers.current.delete(e.pointerId);
    cancelLongPress();

    // tap: un solo dito, breve, quasi fermo, long-press non scattato
    const duration = e.timeStamp - p.startT;
    if (
      pointers.current.size === 0 &&
      !longPressFired.current &&
      duration <= TAP_MAX_MS &&
      totalMove.current <= TAP_MAX_PX
    ) {
      tapClick();
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    cancelLongPress();
  };

  // ---- pulsanti fisici L/R (pressione prolungata = drag) ----

  const buttonHandlers = (b: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      conn.send({ t: 'mbtn', b, act: 'd' });
      setDragging(true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      conn.send({ t: 'mbtn', b, act: 'u' });
      setDragging(false);
    },
    onPointerCancel: () => {
      conn.send({ t: 'mbtn', b, act: 'u' });
      setDragging(false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div className="trackpad">
      <div
        ref={padRef}
        className={`pad ${dragging ? 'dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="pad-hint">1 dito: muovi · tap: click · lungo: destro · 2 dita: scroll</span>
      </div>
      <div className="pad-buttons">
        <button className="pad-btn" {...buttonHandlers(0)}>Click sx</button>
        <button className="pad-btn" {...buttonHandlers(1)}>Click dx</button>
      </div>
    </div>
  );
}
