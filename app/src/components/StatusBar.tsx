import type { DeviceInfo } from '../protocol/messages';
import type { ConnStatus } from '../protocol/connection';
import type { Transport } from '../hooks/useConnection';
import { IconBluetooth, IconBug, IconSettings, IconWifi } from './Icons';

interface Props {
  status: ConnStatus;
  statusDetail?: string;
  device: DeviceInfo | null;
  transport: Transport;
  onOpenSettings: () => void;
  onDisconnect: () => void;
}

const TRANSPORT_NAME: Record<Transport, string> = {
  ws: 'WiFi',
  ble: 'BLE',
  demo: 'DEMO',
};

export function StatusBar({
  status,
  statusDetail,
  device,
  transport,
  onOpenSettings,
  onDisconnect,
}: Props) {
  const isReady = status === 'ready';
  const isReconnecting = status === 'reconnecting' || status === 'connecting' || status === 'authing';
  const isError = status === 'error';
  const usbMissing = device && device.usb === 'unmounted';

  const dotClass = isReady ? 'ok' : isReconnecting ? 'warn' : 'bad';

  return (
    <header className="statusbar">
      <div className="status-left">
        <span className={`dot ${dotClass}`} />
        <span className={`transport-pill ${transport === 'demo' ? 'is-demo' : ''}`}>
          {transport === 'ws' && <IconWifi size={14} />}
          {transport === 'ble' && <IconBluetooth size={14} />}
          {transport === 'demo' && <IconBug size={14} />}
          <span>{TRANSPORT_NAME[transport]}</span>
        </span>
      </div>

      <div className="status-center">
        {isReconnecting && (
          <span className="status-pill warn">
            Reconnecting…
            <button type="button" className="status-pill-action" onClick={onDisconnect}>
              Cancel
            </button>
          </span>
        )}
        {!isReconnecting && isError && (
          <span className="status-pill bad" title={statusDetail ?? 'Connection lost'}>
            Connection lost
            <button type="button" className="status-pill-action" onClick={onDisconnect}>
              Reconnect
            </button>
          </span>
        )}
        {!isReconnecting && !isError && usbMissing && (
          <span className="status-pill bad" title="Plug the ESP32 into your PC or TV via USB">
            USB not detected
          </span>
        )}
        {!isReconnecting && !isError && !usbMissing && device && (
          <span className="status-meta">PocketHID</span>
        )}
      </div>

      <button
        type="button"
        className="icon-btn"
        onClick={onOpenSettings}
        aria-label="Settings and device status"
        title="Settings"
      >
        <IconSettings size={20} />
      </button>
    </header>
  );
}
