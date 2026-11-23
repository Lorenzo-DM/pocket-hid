// Base comune dei client BLE: handshake hello/welcome, heartbeat {t:"state"},
// riconnessione con backoff, dispatch messaggi. Le sottoclassi implementano
// solo le primitive della piattaforma (scelta device, GATT, write, notify).

import { parseInMsg, serialize, type DeviceInfo, type InMsg, type OutMsg } from './messages';
import type { ConnectionCallbacks, ConnStatus, DeviceLink } from './connection';

// UUID in docs/protocol.md — devono combaciare con firmware/src/ble_server.cpp
export const BLE_SVC = '7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f';
export const BLE_RX = '7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // app -> ESP
export const BLE_TX = '7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // ESP -> app

const HEARTBEAT_MS = 15000;
const MAX_BACKOFF_MS = 15000;
const MAX_RECONNECTS = 5;

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export abstract class BleBase implements DeviceLink {
  protected cb: ConnectionCallbacks = {};
  protected manualClose = false;
  protected attempts = 0;
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
    this.releaseDevice();
    this.cb.onStatus?.('closed');
  }

  send(msg: OutMsg): boolean {
    // mouse/scroll sono piccoli e ripetuti: il trasporto puo' usare il canale
    // veloce (write-without-response); gli altri valgono la via affidabile
    const urgent = msg.t === 'mouse' || msg.t === 'scroll';
    this.writeRaw(encoder.encode(serialize(msg)), urgent);
    return true;
  }

  protected status(s: ConnStatus, detail?: string) {
    this.cb.onStatus?.(s, detail);
  }

  // --- primitive specifiche piattaforma ---

  // Sceglie il device (gesto utente) e apre GATT+service+chars+notify.
  // Deve risolvere a connessione e notifiche attive.
  protected abstract open(): Promise<void>;

  // Scrive i byte; urgent=true -> può usare il canale senza risposta
  protected abstract writeRaw(data: Uint8Array, urgent: boolean): void;

  protected abstract releaseDevice(): void;

  // --- da chiamare dalle sottoclassi ---

  protected handleNotify(data: DataView) {
    const msg = parseInMsg(decoder.decode(data));
    if (!msg) return;
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

  protected sendHello() {
    this.attempts = 0;
    this.startHeartbeat();
    this.writeRaw(encoder.encode(serialize({ t: 'hello', v: 1 })), false);
  }

  protected onLinkLost() {
    if (this.manualClose) return;
    this.clearTimers();
    this.cb.onStatus?.('reconnecting');
    this.scheduleReconnect();
  }

  protected handleError(msg: string) {
    this.cb.onStatus?.('error', msg);
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
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
