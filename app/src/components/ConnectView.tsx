import { useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { currentTransport, setTransport, type Transport } from '../hooks/useConnection';

interface Props {
  conn: DeviceLink;
  statusDetail?: string;
}

const URL_KEY = 'mk.url';
const TOKEN_KEY = 'mk.token';

const MODES: { id: Transport; label: string }[] = [
  { id: 'ws', label: '🏠 WiFi' },
  { id: 'ble', label: '🔵 Bluetooth' },
  { id: 'demo', label: '🐞 Demo' },
];

export function ConnectView({ conn, statusDetail }: Props) {
  // Il tipo di connessione si decide al mount dell'hook: cambiare modalita'
  // persista la scelta e ricarica la pagina.
  const [mode] = useState<Transport>(currentTransport());
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? 'ws://esp32-hid.local/ws');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');

  const switchMode = (m: Transport) => {
    if (m === mode) return;
    if (m === 'demo') {
      try {
        localStorage.setItem('mk.debug', '1');
        localStorage.removeItem('mk.transport');
      } catch {
        // storage non disponibile
      }
    } else {
      setTransport(m);
    }
    location.reload();
  };

  const doConnect = () => {
    if (mode === 'demo') {
      conn.connect('', '');
      return;
    }
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(TOKEN_KEY, token);
    conn.connect(url.trim(), token);
  };

  const connectLabel =
    mode === 'demo' ? 'Entra in demo' : mode === 'ble' ? 'Seleziona dispositivo' : 'Connetti';

  return (
    <div className="connect">
      <h1>MK-Remote</h1>
      <p className="muted">Tastiera e mouse per la tua TV o il tuo PC</p>

      <div className="transport-tabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`transport-tab ${mode === m.id ? 'active' : ''}`}
            onClick={() => switchMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'ws' && (
        <>
          <label>
            Indirizzo ESP32
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ws://esp32-hid.local/ws oppure ws://192.168.x.x/ws"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label>
            Token <span className="muted">(se configurato sul firmware)</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="vuoto = nessuna auth"
              autoComplete="off"
            />
          </label>
        </>
      )}

      {mode === 'ble' && (
        <p className="hint">
          Scegli il dispositivo <strong>MK-Remote</strong> nella finestra di pairing
          del browser. Il primo accoppiamento va confermato anche sull'ESP
          (pairing BLE obbligatorio). Su iOS/Android serve l'app nativa
          (Capacitor, in arrivo).
        </p>
      )}

      <button className="primary" onClick={doConnect}>{connectLabel}</button>

      {statusDetail && <p className="error">{statusDetail}</p>}

      {mode === 'ws' && (
        <p className="hint">
          Connetti il telefono alla stessa rete WiFi dell'ESP32.
          L'indirizzo di default funziona se il firmware ha mDNS attivo;
          in alternativa usa l'IP mostrato dal log seriale.
        </p>
      )}
    </div>
  );
}
