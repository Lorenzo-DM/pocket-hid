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
  const wsBlocked = transport === 'ws' && !Capacitor.isNativePlatform() && location.protocol === 'https:';

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
      ? 'Authenticating…'
      : 'Connecting…'
    : transport === 'demo'
      ? 'Start Demo mode'
      : transport === 'ble'
        ? 'Select BLE device'
        : 'Connect';

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
            <h1>PocketHID</h1>
            <p className="muted">Mouse, keyboard &amp; macros for PC, TV, and any USB device</p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="Connection transport">
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

        {transport === 'ws' && wsBlocked && (
          <div className="callout warn">
            <strong>WiFi WebSocket is blocked on HTTPS pages.</strong> Use <strong>Bluetooth</strong> here, or open <code>http://pockethid.local/</code> (or the Android app) for WiFi.
          </div>
        )}

        {transport === 'ws' && !wsBlocked && (
          <details className="advanced-box" open={!servedByEsp || Boolean(statusDetail)}>
            <summary>
              <span>WiFi target</span>
              <span className="summary-val">{url.replace(/^ws:\/\//, '').replace(/\/ws$/, '')}</span>
            </summary>
            <div className="advanced-fields">
              <label className="field">
                <span>ESP32 WebSocket URL</span>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="ws://pockethid.local/ws"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>

              <label className="field">
                <span>
                  Token <small className="muted">(optional)</small>
                </span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="empty = no auth"
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
                <strong>Web Bluetooth requires HTTPS.</strong> From a page served over HTTP by the ESP32, use <strong>WiFi</strong>, the hosted HTTPS PWA, or the Android app.
              </>
            ) : (
              <>
                Select <strong>PocketHID</strong> in the Bluetooth picker. On first connection, confirm the pairing prompt.
              </>
            )}
          </div>
        )}

        {transport === 'demo' && (
          <div className="callout">
            Simulated mode without hardware: test trackpad, remote, keyboard, and macros with a live packet log.
          </div>
        )}

        <div className="connect-actions">
          <button type="submit" className="btn-primary full" disabled={busy || bleBlocked || wsBlocked}>
            {connectLabel}
          </button>
          {busy && (
            <button
              type="button"
              className="btn-secondary full"
              onClick={() => conn.disconnect()}
            >
              Cancel
            </button>
          )}
        </div>

        {statusDetail && <p className="callout error">{statusDetail}</p>}

        {transport === 'ws' && !wsBlocked && (
          <p className="hint-sm">
            Connect your phone to the same WiFi as the ESP32 or to its <code>PocketHID</code> hotspot.
          </p>
        )}
      </form>
    </div>
  );
}
