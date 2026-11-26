// Common base for BLE clients: hello/welcome handshake, {t:"state"} heartbeat,
// backoff reconnection, and message dispatch. Subclasses implement only
// platform primitives (device picker, GATT, write, notify).

import { parseInMsg, serialize, type DeviceInfo, type InMsg, type OutMsg } from './messages';
import type { ConnectionCallbacks, ConnStatus, DeviceLink } from './connection';

// UUIDs from docs/protocol.md — must match firmware/src/ble_server.cpp
export const BLE_SVC = '7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f';
export const BLE_RX = '7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // app -> ESP
export const BLE_TX = '7a0c1002-8b6d-4d3f-9a2e-5f1c2b3d4e5f'; // ESP -> app

const HELLO_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const MAX_BACKOFF_MS = 15000;
const MAX_RECONNECTS = 5;
const RX_BUF_MAX = 4096;
const RX_CHUNK_TIMEOUT_MS = 1500;

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function isBleCancelError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'NotFoundError') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /user cancel|cancel(l)?ed|no device selected/i.test(msg);
}

export abstract class BleBase implements DeviceLink {
  protected cb: ConnectionCallbacks = {};
  protected manualClose = false;
  protected hasConnected = false;
  protected reconnecting = false;
  protected attempts = 0;
  private ignoringDisconnect = false;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.hasConnected = false;
    this.reconnecting = false;
    this.attempts = 0;
    this.clearTimers();
    void this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.hasConnected = false;
    this.reconnecting = false;
    this.clearTimers();
    this.ignoringDisconnect = true;
    try {
      this.releaseDevice();
    } finally {
      this.ignoringDisconnect = false;
    }
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

  // Disconnect GATT without forgetting the selected device (for reconnects)
  protected abstract dropConnection(): void;

  // Disconnect GATT and forget the selected device (manual close / initial failure)
  protected abstract releaseDevice(): void;

  // --- called by subclasses ---

  protected handleNotify(data: DataView) {
    const chunk = this.rxDecoder.decode(data, { stream: true });
    if (!chunk) return;

    this.clearHeartbeatTimeout();

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
        this.clearHello();
        this.hasConnected = true;
        this.reconnecting = false;
        this.attempts = 0;
        const info: DeviceInfo = msg;
        this.cb.onDeviceInfo?.(info);
        this.cb.onStatus?.('ready');
        this.startHeartbeat();
        break;
      }
      case 'error':
        this.cb.onError?.(msg.msg);
        break;
    }
  }

  protected sendHello() {
    this.clearHello();
    this.writeRaw(encoder.encode(serialize({ t: 'hello', v: 1 })), false);
    this.helloTimer = setTimeout(() => {
      if (this.manualClose) return;
      this.handleOpenFailure('BLE: No handshake response from ESP32 (hello timeout)');
    }, HELLO_TIMEOUT_MS);
  }

  protected onLinkLost() {
    if (this.manualClose || this.ignoringDisconnect) return;
    this.clearTimers();
    if (!this.hasConnected) {
      this.releaseDevice();
      this.cb.onStatus?.('error', 'BLE: Connection dropped during setup');
      return;
    }
    this.reconnecting = true;
    this.scheduleReconnect();
  }

  protected handleOpenFailure(msg: string) {
    this.clearTimers();
    this.ignoringDisconnect = true;
    try {
      if (this.reconnecting) {
        this.dropConnection();
      } else {
        this.releaseDevice();
      }
    } finally {
      this.ignoringDisconnect = false;
    }

    if (this.manualClose) return;

    if (this.reconnecting) {
      this.scheduleReconnect();
      return;
    }
    this.cb.onStatus?.('error', msg);
  }

  protected handleError(msg: string) {
    this.cb.onStatus?.('error', msg);
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
    this.attempts++;
    if (this.attempts > MAX_RECONNECTS) {
      this.reconnecting = false;
      this.cb.onStatus?.('error', 'BLE reconnect failed: reconnect from the Connect screen');
      return;
    }
    this.cb.onStatus?.('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts, 4));
    this.reconnectTimer = setTimeout(() => {
      void this.open();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ t: 'state' });
      this.clearHeartbeatTimeout();
      this.heartbeatTimeoutTimer = setTimeout(() => {
        if (this.manualClose) return;
        this.ignoringDisconnect = true;
        try {
          this.dropConnection();
        } finally {
          this.ignoringDisconnect = false;
        }
        this.clearTimers();
        this.reconnecting = true;
        this.scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout() {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private clearHello() {
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
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
    this.clearHello();
    this.stopHeartbeat();
    this.resetRx();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
