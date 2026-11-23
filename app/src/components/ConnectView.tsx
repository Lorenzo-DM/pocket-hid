import { useState } from 'react';
import type { DeviceLink } from '../protocol/connection';
import { isDebugMode, setDebugMode } from '../protocol/debug';

interface Props {
  conn: DeviceLink;
  statusDetail?: string;
}

const URL_KEY = 'mk.url';
const TOKEN_KEY = 'mk.token';

export function ConnectView({ conn, statusDetail }: Props) {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? 'ws://esp32-hid.local/ws');
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [debug, setDebug] = useState(isDebugMode());

  const toggleDebug = () => {
    const on = !debug;
    setDebugMode(on);
    setDebug(on);
    // il tipo di connessione si sceglie al mount dell'hook: ricarica la pagina
    location.reload();
  };

  const doConnect = () => {
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(TOKEN_KEY, token);
    conn.connect(url.trim(), token);
  };

  return (
    <div className="connect">
      <h1>MK-Remote{debug ? ' · debug' : ''}</h1>
      <p className="muted">Tastiera e mouse per la tua TV o il tuo PC</p>

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

      <button className="primary" onClick={doConnect}>
        {debug ? 'Entra in demo' : 'Connetti'}
      </button>

      <button className="link debug-toggle" onClick={toggleDebug}>
        {debug ? '✕ esci dalla modalità debug' : '🐞 modalità debug (senza ESP)'}
      </button>

      {statusDetail && <p className="error">{statusDetail}</p>}

      <p className="hint">
        Connetti il telefono alla stessa rete WiFi dell'ESP32.
        L'indirizzo di default funziona se il firmware ha mDNS attivo;
        in alternativa usa l'IP mostrato dal log seriale.
      </p>
    </div>
  );
}
