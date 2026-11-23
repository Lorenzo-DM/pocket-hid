// Client BLE via Web Bluetooth (Chrome/Edge desktop+Android; su iOS serve il
// guscio Capacitor, fase 7b). Stessa interfaccia DeviceLink del WebSocket:
// handshake hello/welcome, heartbeat {t:"state"}, riconnessione al device
// già scelto (requestDevice richiede il gesto utente solo la prima volta).

import { parseInMsg, serialize, type DeviceInfo, type InMsg, type OutMsg } from './messages';
import type { ConnectionCallbacks, DeviceLink } from './connection';

// UUID in docs/protocol.md — devono combaciare con firmware/src/ble_server.cpp
const BLE_SVC = '7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f';
const BLE_RX = '7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // app -> ESP
const BLE_TX = '7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // ESP -> app

const HEARTBEAT_MS = 15000;
const MAX_BACKOFF_MS = 15000;
const MAX_RECONNECTS = 5;
// oltre questa dimensione si usa la long write (con risposta), che il SO
// frammenta; sotto, write-without-response (latenza minima)
const FAST_WRITE_MAX = 244;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class BleConnection implements DeviceLink {
  private cb: ConnectionCallbacks = {};
  private device: BluetoothDevice | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;

  private manualClose = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private msgListeners = new Set<(msg: InMsg) => void>();

  onMessage(fn: (msg: InMsg) => void): () => void {
    this.msgListeners.add(fn);
    return () => this.msgListeners.delete(fn);
  }

  setCallbacks(cb: ConnectionCallbacks) {
    this.cb = cb;
  }

  connect(_url?: string, _token?: string) {
    this.manualClose = false;
    this.attempts = 0;
    void this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.clearTimers();
    this.device?.gatt.disconnect();
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
    this.cb.onStatus?.('closed');
  }

  send(msg: OutMsg): boolean {
    if (!this.rxChar) return false;
    const data = encoder.encode(serialize(msg));
    const ch = this.rxChar;
    // mouse/scroll: fire-and-forget se ci sta in un pacchetto
    if (ch.properties.writeWithoutResponse && data.length <= FAST_WRITE_MAX) {
      ch.writeValueWithoutResponse?.(data).catch(() => undefined);
    } else if (ch.properties.write) {
      ch.writeValueWithResponse?.(data).catch(() => this.cb.onError?.('write BLE non riuscito'));
    } else {
      ch.writeValue(data).catch(() => undefined);
    }
    return true;
  }

  // --- interni ---

  private async open() {
    this.cb.onStatus?.('connecting');

    if (!navigator.bluetooth) {
      this.cb.onStatus?.(
        'error',
        'Web Bluetooth non disponibile: usa Chrome/Edge (desktop o Android); su iOS serve il guscio nativo.'
      );
      return;
    }

    try {
      if (!this.device) {
        // richiede gesto utente: connect() parte dal click su "Connetti"
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [BLE_SVC] }],
        });
        this.device.addEventListener('gattserverdisconnected', () => this.onDisconnected());
      }
      if (!this.device.gatt) throw new Error('GATT non disponibile');

      this.cb.onStatus?.('authing');
      const server = await this.device.gatt.connect();
      const svc = await server.getPrimaryService(BLE_SVC);
      this.txChar = await svc.getCharacteristic(BLE_TX);
      this.rxChar = await svc.getCharacteristic(BLE_RX);
      await this.txChar.startNotifications();
      this.txChar.addEventListener('characteristicvaluechanged', (ev) => this.onNotify(ev));

      // handshake (il pairing è già avvenuto: write cifrata accettata)
      this.sendHello();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.cb.onStatus?.('error', `BLE: ${msg}`);
    }
  }

  private sendHello() {
    this.attempts = 0;
    this.startHeartbeat();
    this.writeNow(serialize({ t: 'hello', v: 1 }));
  }

  private writeNow(json: string) {
    if (!this.rxChar) return;
    const data = encoder.encode(json);
    this.rxChar.writeValueWithResponse?.(data).catch(() => undefined);
  }

  private onNotify(ev: Event) {
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    if (!ch.value) return;
    const raw = decoder.decode(ch.value);
    const msg = parseInMsg(raw);
    if (!msg) return;
    this.handleIn(msg);
  }

  private handleIn(msg: InMsg) {
    this.msgListeners.forEach((fn) => fn(msg));
    switch (msg.t) {
      case 'welcome':
      case 'state': {
        const info: DeviceInfo = msg;
        this.cb.onDeviceInfo?.(info);
        this.cb.onStatus?.('ready');
        break;
      }
      case 'error':
        this.cb.onError?.(msg.msg);
        break;
    }
  }

  private onDisconnected() {
    if (this.manualClose) return;
    this.clearTimers();
    this.rxChar = null;
    this.txChar = null;
    this.cb.onStatus?.('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.manualClose || !this.device) return;
    this.attempts++;
    if (this.attempts > MAX_RECONNECTS) {
      this.cb.onStatus?.('error', 'riconnessione BLE fallita: ricomincia dal Connetti');
      return;
    }
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts, 4));
    this.reconnectTimer = setTimeout(() => {
      void this.open();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send({ t: 'state' }), HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
