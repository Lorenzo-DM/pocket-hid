import type { DeviceInfo } from '../protocol/messages';
import type { ConnStatus } from '../protocol/connection';

interface Props {
  status: ConnStatus;
  device: DeviceInfo | null;
  onDisconnect: () => void;
}

const STATUS_LABEL: Record<ConnStatus, string> = {
  idle: 'Non connesso',
  connecting: 'Connessione…',
  authing: 'Handshake…',
  ready: 'Connesso',
  reconnecting: 'Riconnessione…',
  closed: 'Disconnesso',
  error: 'Errore',
};

export function StatusBar({ status, device, onDisconnect }: Props) {
  return (
    <header className="statusbar">
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
