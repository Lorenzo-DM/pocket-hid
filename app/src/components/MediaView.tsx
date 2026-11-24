import { useEffect, useRef, useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { CONSUMER, K, MOD } from '../protocol/hid';
import {
  IconBackspace,
  IconChevron,
  IconNext,
  IconPlayPause,
  IconPower,
  IconPrev,
  IconStop,
  IconSun,
  IconVolumeDown,
  IconVolumeMute,
  IconVolumeUp,
} from './Icons';

interface Props {
  conn: DeviceLink;
  vibrate: (p?: number | number[]) => void;
}

// Telecomando universale: D-Pad + navigazione (Smart TV / media center / presentazioni)
// + controlli multimediali, volume, luminosità e Power con protezione doppio tocco.

const REPEAT_DELAY_MS = 380;
const REPEAT_INTERVAL_MS = 130;
const MEDIA_REPEAT_MS = 260;

export function MediaView({ conn, vibrate }: Props) {
  const repeatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const powerReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [powerArmed, setPowerArmed] = useState(false);

  const stopRepeat = () => {
    if (repeatTimeout.current) {
      clearTimeout(repeatTimeout.current);
      repeatTimeout.current = null;
    }
    if (repeatInterval.current) {
      clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopRepeat();
      if (powerReset.current) clearTimeout(powerReset.current);
    };
  }, []);

  const holdAction = (action: () => void, intervalMs = REPEAT_INTERVAL_MS) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      stopRepeat();
      action();
      vibrate(10);
      repeatTimeout.current = setTimeout(() => {
        repeatInterval.current = setInterval(action, intervalMs);
      }, REPEAT_DELAY_MS);
    },
    onPointerUp: stopRepeat,
    onPointerCancel: stopRepeat,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const sendConsumer = (code: number) => conn.send({ t: 'consumer', code });
  const sendKey = (code: number) => conn.send({ t: 'key', code, mods: 0, act: 't' });

  const tapConsumer = (code: number) => {
    sendConsumer(code);
    vibrate(10);
  };

  const tapKey = (code: number) => {
    sendKey(code);
    vibrate(10);
  };

  const handlePower = () => {
    if (!powerArmed) {
      setPowerArmed(true);
      vibrate([12, 40, 12]);
      if (powerReset.current) clearTimeout(powerReset.current);
      powerReset.current = setTimeout(() => setPowerArmed(false), 2600);
      return;
    }
    setPowerArmed(false);
    if (powerReset.current) clearTimeout(powerReset.current);
    sendConsumer(CONSUMER.POWER);
    vibrate(25);
  };

  return (
    <div className="remote">
      {/* Riga superiore: Luminosità e Power (protetto) */}
      <div className="remote-top">
        <div className="pill-group" aria-label="Luminosità">
          <button
            type="button"
            className="pill-btn"
            aria-label="Riduci luminosità"
            {...holdAction(() => sendConsumer(CONSUMER.BRIGHTNESS_DOWN), MEDIA_REPEAT_MS)}
          >
            <IconSun size={16} />
            <span>−</span>
          </button>
          <button
            type="button"
            className="pill-btn"
            aria-label="Aumenta luminosità"
            {...holdAction(() => sendConsumer(CONSUMER.BRIGHTNESS_UP), MEDIA_REPEAT_MS)}
          >
            <IconSun size={16} />
            <span>+</span>
          </button>
        </div>

        <button
          type="button"
          className={`power-btn ${powerArmed ? 'armed' : ''}`}
          onClick={handlePower}
          aria-label="Power"
        >
          <IconPower size={17} />
          <span>{powerArmed ? 'Conferma?' : 'Power'}</span>
        </button>
      </div>

      {/* Centro: D-Pad + Navigazione rapida */}
      <div className="dpad-section">
        <div className="dpad-grid" role="group" aria-label="Controlli direzionali">
          <button
            type="button"
            className="dpad-btn up"
            aria-label="Su"
            {...holdAction(() => sendKey(K.UP))}
          >
            <IconChevron dir="up" size={26} />
          </button>

          <button
            type="button"
            className="dpad-btn left"
            aria-label="Sinistra"
            {...holdAction(() => sendKey(K.LEFT))}
          >
            <IconChevron dir="left" size={26} />
          </button>

          <button
            type="button"
            className="dpad-ok"
            onClick={() => tapKey(K.ENTER)}
            aria-label="OK / Invio"
          >
            OK
          </button>

          <button
            type="button"
            className="dpad-btn right"
            aria-label="Destra"
            {...holdAction(() => sendKey(K.RIGHT))}
          >
            <IconChevron dir="right" size={26} />
          </button>

          <button
            type="button"
            className="dpad-btn down"
            aria-label="Giù"
            {...holdAction(() => sendKey(K.DOWN))}
          >
            <IconChevron dir="down" size={26} />
          </button>
        </div>

        <div className="nav-quick-row">
          <button type="button" className="remote-chip" onClick={() => tapKey(K.ESC)}>
            Esc
          </button>
          <button
            type="button"
            className="remote-chip"
            onClick={() => tapKey(K.BACKSPACE)}
            aria-label="Backspace"
          >
            <IconBackspace size={17} />
          </button>
          <button
            type="button"
            className="remote-chip"
            onClick={() => {
              conn.send({ t: 'key', code: 0, mods: MOD.GUI, act: 't' });
              vibrate(10);
            }}
            aria-label="Tasto Windows / Start"
            title="Start / Launcher"
          >
            ⊞ Win
          </button>
          <button type="button" className="remote-chip" onClick={() => tapKey(K.HOME)}>
            Home
          </button>
          <button type="button" className="remote-chip" onClick={() => tapKey(K.SPACE)}>
            Spazio
          </button>
        </div>
      </div>

      {/* Controlli Volume */}
      <div className="remote-row" role="group" aria-label="Volume">
        <button
          type="button"
          className="remote-btn"
          aria-label="Abbassa volume"
          {...holdAction(() => sendConsumer(CONSUMER.VOLUME_DOWN), MEDIA_REPEAT_MS)}
        >
          <IconVolumeDown size={20} />
          <span>Vol −</span>
        </button>
        <button
          type="button"
          className="remote-btn compact"
          aria-label="Muto"
          onClick={() => tapConsumer(CONSUMER.MUTE)}
        >
          <IconVolumeMute size={20} />
        </button>
        <button
          type="button"
          className="remote-btn"
          aria-label="Alza volume"
          {...holdAction(() => sendConsumer(CONSUMER.VOLUME_UP), MEDIA_REPEAT_MS)}
        >
          <IconVolumeUp size={20} />
          <span>Vol +</span>
        </button>
      </div>

      {/* Controlli Riproduzione */}
      <div className="remote-row" role="group" aria-label="Riproduzione">
        <button
          type="button"
          className="remote-btn"
          aria-label="Traccia precedente"
          onClick={() => tapConsumer(CONSUMER.PREV_TRACK)}
        >
          <IconPrev size={20} />
        </button>
        <button
          type="button"
          className="remote-btn play-main"
          aria-label="Play o Pausa"
          onClick={() => tapConsumer(CONSUMER.PLAY_PAUSE)}
        >
          <IconPlayPause size={22} />
        </button>
        <button
          type="button"
          className="remote-btn"
          aria-label="Traccia successiva"
          onClick={() => tapConsumer(CONSUMER.NEXT_TRACK)}
        >
          <IconNext size={20} />
        </button>
        <button
          type="button"
          className="remote-btn compact"
          aria-label="Stop"
          onClick={() => tapConsumer(CONSUMER.STOP)}
        >
          <IconStop size={18} />
        </button>
      </div>
    </div>
  );
}
