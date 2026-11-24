import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { ConnStatus, DeviceLink } from '../protocol/connection';
import {
  defaultWsUrl,
  isServedByEsp,
  TOKEN_KEY,
  URL_KEY,
  type Transport,
} from '../hooks/useConnection';
import { IconBluetooth, IconBug, IconWifi } from './Icons';

interface Props {
  conn: DeviceLink;
  transport: Transport;
  status: ConnStatus;
  statusDetail?: string;
  onSwitchTransport: (t: Transport) => void;
}

const MODES: { id: Transport; label: string }[] = [
  { id: 'ws', label: 'WiFi' },
  { id: 'ble', label: 'Bluetooth' },
  { id: 'demo', label: 'Demo' },
];

export function ConnectView({
  conn,
  transport,
  status,
  statusDetail,
  onSwitchTransport,
}: Props) {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? defaultWsUrl());
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const servedByEsp = isServedByEsp();

  const busy = status === 'connecting' || status === 'authing' || status === 'reconnecting';
  const bleBlocked = transport === 'ble' && !Capacitor.isNativePlatform() && !window.isSecureContext;

  const doConnect = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (transport === 'demo') {
      conn.connect('', '');
      return;
    }
    if (transport === 'ws') {
      localStorage.setItem(URL_KEY, url.trim());
      localStorage.setItem(TOKEN_KEY, token);
      conn.connect(url.trim(), token);
      return;
    }
    conn.connect('', '');
  };

  const connectLabel = busy
    ? status === 'authing'
      ? 'Autenticazione…'
      : 'Connessione…'
    : transport === 'demo'
      ? 'Avvia modalità Demo'
      : transport === 'ble'
        ? 'Seleziona dispositivo BLE'
        : 'Connetti';

  return (
    <div className="connect-wrap">
      <form className="connect-card" onSubmit={doConnect}>
        <div className="connect-brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1>MK-Remote</h1>
            <p className="muted">Mouse, tastiera e macro per PC, TV e ogni dispositivo USB</p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Canale di connessione">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={transport === m.id}
              className={`seg-btn ${transport === m.id ? 'active' : ''}`}
              onClick={() => onSwitchTransport(m.id)}
            >
              {m.id === 'ws' && <IconWifi size={16} />}
              {m.id === 'ble' && <IconBluetooth size={16} />}
              {m.id === 'demo' && <IconBug size={16} />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {transport === 'ws' && (
          <details className="advanced-box" open={!servedByEsp || Boolean(statusDetail)}>
            <summary>
              <span>Destinazione WiFi</span>
              <span className="summary-val">{url.replace(/^ws:\/\//, '').replace(/\/ws$/, '')}</span>
            </summary>
            <div className="advanced-fields">
              <label className="field">
                <span>Indirizzo WebSocket ESP32</span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ws://esp32-hid.local/ws"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>

              <label className="field">
                <span>
                  Token <small className="muted">(opzionale)</small>
                </span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="vuoto = nessuna auth"
                  autoComplete="off"
                />
              </label>
            </div>
          </details>
        )}

        {transport === 'ble' && (
          <div className={`callout ${bleBlocked ? 'warn' : ''}`}>
            {bleBlocked ? (
              <>
                <strong>Web Bluetooth richiede HTTPS.</strong> Da pagina servita dall&apos;ESP in HTTP usa il canale <strong>WiFi</strong> oppure l&apos;app Android.
              </>
            ) : (
              <>
                Seleziona <strong>MK-Remote</strong> nella finestra Bluetooth del dispositivo. Al primo utilizzo conferma il pairing.
              </>
            )}
          </div>
        )}

        {transport === 'demo' && (
          <div className="callout">
            Modalità simulata senza hardware: testa trackpad, telecomando, tastiera e macro con log dei pacchetti in tempo reale.
          </div>
        )}

        <div className="connect-actions">
          <button type="submit" className="btn-primary full" disabled={busy || bleBlocked}>
            {connectLabel}
          </button>
          {busy && (
            <button
              type="button"
              className="btn-secondary full"
              onClick={() => conn.disconnect()}
            >
              Annulla
            </button>
          )}
        </div>

        {statusDetail && <p className="callout error">{statusDetail}</p>}

        {transport === 'ws' && (
          <p className="hint-sm">
            Collega il telefono alla stessa WiFi dell&apos;ESP32 o al suo hotspot <code>MK-Remote</code>.
          </p>
        )}
      </form>
    </div>
  );
}
