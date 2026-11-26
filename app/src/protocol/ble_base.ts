// Common base for BLE clients: hello/welcome handshake, {t:"state"} heartbeat,
// backoff reconnection, and message dispatch. Subclasses implement only
// platform primitives (device picker, GATT, write, notify).

import { parseInMsg, serialize, type DeviceInfo, type InMsg, type OutMsg } from './messages';
import type { ConnectionCallbacks, ConnStatus, DeviceLink } from './connection';

// UUIDs from docs/protocol.md — must match firmware/src/ble_server.cpp
export const BLE_SVC = '7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f';
export const BLE_RX = '7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // app -> ESP
export const BLE_TX = '7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // ESP -> app

const HEARTBEAT_MS = 15000;
const MAX_BACKOFF_MS = 15000;
const MAX_RECONNECTS = 5;
const RX_BUF_MAX = 4096;
const RX_CHUNK_TIMEOUT_MS = 1500;

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export abstract class BleBase implements DeviceLink {
  protected cb: ConnectionCallbacks = {};
  protected manualClose = false;
  protected attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private rxTimer: ReturnType<typeof setTimeout> | null = null;
  private rxBuf = '';
  private rxDecoder = new TextDecoder();
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
    // mouse/scroll are small and frequent: transport can use the fast path
    // (write-without-response); other messages use reliable writes
    const urgent = msg.t === 'mouse' || msg.t === 'scroll';
    this.writeRaw(encoder.encode(serialize(msg)), urgent);
    return true;
  }

  protected status(s: ConnStatus, detail?: string) {
    this.cb.onStatus?.(s, detail);
  }

  // --- platform-specific primitives ---

  // Pick device (user gesture) and open GATT + service + chars + notifications.
  // Must resolve once connected and notifications are active.
  protected abstract open(): Promise<void>;

  // Write raw bytes; urgent=true may use write-without-response
  protected abstract writeRaw(data: Uint8Array, urgent: boolean): void;

  protected abstract releaseDevice(): void;

  // --- called by subclasses ---

  protected handleNotify(data: DataView) {
    const chunk = this.rxDecoder.decode(data, { stream: true });
    if (!chunk) return;

    if (this.rxTimer) {
      clearTimeout(this.rxTimer);
      this.rxTimer = null;
    }

    this.rxBuf += chunk;
    if (this.rxBuf.length > RX_BUF_MAX) {
      this.resetRx();
      return;
    }

    const msg = parseInMsg(this.rxBuf);
    if (!msg) {
      // Response split across multiple notifications (e.g. macro_data > MTU): wait for next chunk
      this.rxTimer = setTimeout(() => {
        this.resetRx();
      }, RX_CHUNK_TIMEOUT_MS);
      return;
    }

    this.resetRx();
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
      this.cb.onStatus?.('error', 'BLE reconnect failed: reconnect from the Connect screen');
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

  private resetRx() {
    this.rxBuf = '';
    this.rxDecoder = new TextDecoder();
    if (this.rxTimer) {
      clearTimeout(this.rxTimer);
      this.rxTimer = null;
    }
  }

  private clearTimers() {
    this.stopHeartbeat();
    this.resetRx();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
