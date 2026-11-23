import { useEffect, useRef } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { CONSUMER } from '../protocol/hid';

interface Props {
  conn: DeviceLink;
}

// Media keys (consumer page 0x0C). Volume e luminosità si ripetono
// tenendo premuto; il resto è un tap singolo.

const REPEAT_MS = 350;

interface Btn {
  label: string;
  code: number;
  repeat?: boolean;
  danger?: boolean;
  wide?: boolean;
}

const GROUPS: Btn[][] = [
  [
    { label: '➖ Vol', code: CONSUMER.VOLUME_DOWN, repeat: true },
    { label: '🔇 Mute', code: CONSUMER.MUTE },
    { label: 'Vol ➕', code: CONSUMER.VOLUME_UP, repeat: true },
  ],
  [
    { label: '⏮ Prev', code: CONSUMER.PREV_TRACK },
    { label: '▶️ / ⏸', code: CONSUMER.PLAY_PAUSE },
    { label: 'Next ⏭', code: CONSUMER.NEXT_TRACK },
  ],
  [
    { label: '⏹ Stop', code: CONSUMER.STOP },
    { label: '☀️ ➖', code: CONSUMER.BRIGHTNESS_DOWN, repeat: true },
    { label: '☀️ ➕', code: CONSUMER.BRIGHTNESS_UP, repeat: true },
  ],
  [
    { label: '⏻ Power', code: CONSUMER.POWER, danger: true, wide: true },
  ],
];

export function MediaView({ conn }: Props) {
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (repeatTimer.current) clearInterval(repeatTimer.current);
    };
  }, []);

  const stopRepeat = () => {
    if (repeatTimer.current) {
      clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  };

  const press = (b: Btn) => {
    stopRepeat();
    conn.send({ t: 'consumer', code: b.code });
    if (b.repeat) {
      repeatTimer.current = setInterval(() => conn.send({ t: 'consumer', code: b.code }), REPEAT_MS);
    }
  };

  return (
    <div className="media">
      {GROUPS.map((group, i) => (
        <div className="media-row" key={i}>
          {group.map((b, j) => (
            <button
              key={j}
              className={`media-btn ${b.danger ? 'danger' : ''}`}
              style={b.wide ? { flex: 2.2 } : undefined}
              onPointerDown={() => press(b)}
              onPointerUp={stopRepeat}
              onPointerLeave={stopRepeat}
              onPointerCancel={stopRepeat}
              onContextMenu={(e) => e.preventDefault()}
            >
              {b.label}
            </button>
          ))}
        </div>
      ))}
      <p className="hint">
        Volume e luminosità si ripetono tenendo premuto. Power potrebbe richiedere
        una pressione lunga sul target.
      </p>
    </div>
  );
}
