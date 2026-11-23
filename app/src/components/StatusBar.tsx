import type { DeviceInfo } from '../protocol/messages';
import type { ConnStatus } from '../protocol/connection';
import type { Transport } from '../hooks/useConnection';

interface Props {
  status: ConnStatus;
  device: DeviceInfo | null;
  transport?: Transport;
  debug?: boolean;
  onDisconnect: () => void;
}

const TRANSPORT_LABEL: Record<Transport, string> = {
  ws: '🏠',
  ble: '🔵',
  demo: '🐞',
};

const STATUS_LABEL: Record<ConnStatus, string> = {
  idle: 'Non connesso',
  connecting: 'Connessione…',
  authing: 'Handshake…',
  ready: 'Connesso',
  reconnecting: 'Riconnessione…',
  closed: 'Disconnesso',
  error: 'Errore',
};

export function StatusBar({ status, device, transport, onDisconnect }: Props) {
  return (
    <header className="statusbar">
      {transport && (
        <span
          className={`transport-badge ${transport === 'demo' ? 'demo-badge' : ''}`}
          title={transport === 'ws' ? 'WiFi' : transport === 'ble' ? 'Bluetooth' : 'Demo'}
        >
          {TRANSPORT_LABEL[transport]}
        </span>
      )}
      <span className={`dot ${status === 'ready' ? 'ok' : 'bad'}`} />
      <span className="status-label">{STATUS_LABEL[status]}</span>
      {device && (
        <span className="muted">
          fw {device.fw} · USB {device.usb === 'mounted' ? '✓' : '✗'} · layout {device.layout}
        </span>
      )}
      <button className="link" onClick={onDisconnect}>Disconnetti</button>
    </header>
  );
}
