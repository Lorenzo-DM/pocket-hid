// WebSocket client: hello/welcome handshake, auth token, exponential backoff
// reconnection, and application-level heartbeat (browsers do not expose
// WebSocket protocol ping frames).

import { parseInMsg, serialize, type DeviceInfo, type InMsg, type OutMsg } from './messages';

export type ConnStatus =
  | 'idle'
  | 'connecting'
  | 'authing'
  | 'ready'
  | 'reconnecting'
  | 'closed'
  | 'error';

export interface ConnectionCallbacks {
  onStatus?: (status: ConnStatus, detail?: string) => void;
  onDeviceInfo?: (info: DeviceInfo) => void;
  onError?: (msg: string) => void;
}

// Public transport interface used by the app. Implemented by Connection
// (WebSocket), BleBase subclasses (BLE), and MockConnection (demo mode).
export interface DeviceLink {
  setCallbacks(cb: ConnectionCallbacks): void;
  connect(url: string, token?: string): void;
  disconnect(): void;
  send(msg: OutMsg): boolean;
  // Subscribe to all incoming messages (e.g. macro_data/macro_done); returns unsubscribe fn
  onMessage?(fn: (msg: InMsg) => void): () => void;
}

const HELLO_TIMEOUT_MS = 4000;
const HEARTBEAT_MS = 15000;
const MAX_BACKOFF_MS = 15000;

export class Connection {
  private ws: WebSocket | null = null;
  private url = '';
  private token = '';
  private attempts = 0;
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private cb: ConnectionCallbacks = {};
  private msgListeners = new Set<(msg: InMsg) => void>();

  // Subscribe to incoming messages (e.g. macro_data/macro_done)
  onMessage(fn: (msg: InMsg) => void): () => void {
    this.msgListeners.add(fn);
    return () => this.msgListeners.delete(fn);
  }

  setCallbacks(cb: ConnectionCallbacks) {
    this.cb = cb;
  }

  connect(url: string, token = '') {
    this.manualClose = false;
    this.url = url;
    this.token = token;
    this.attempts = 0;
    this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
    this.cb.onStatus?.('closed');
  }

  send(msg: OutMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(serialize(msg));
    return true;
  }

  // --- internals ---

  private open() {
    this.cleanupSocket();
    this.cb.onStatus?.(this.attempts > 0 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.cb.onStatus?.('error', `Invalid URL: ${String(e)}`);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.cb.onStatus?.('authing');
      ws.send(serialize({ t: 'hello', v: 1, token: this.token }));
      this.helloTimer = setTimeout(() => {
        if (this.ws !== ws) return;
        this.cb.onStatus?.('error', 'No handshake response (hello)');
        this.scheduleReconnect();
      }, HELLO_TIMEOUT_MS);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = parseInMsg(ev.data);
      if (!msg) return;
      this.handleIn(msg);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.clearTimers();
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnection
    };
  }

  private handleIn(msg: InMsg) {
    this.msgListeners.forEach((fn) => fn(msg));
    switch (msg.t) {
      case 'welcome':
      case 'state': {
        this.clearHello();
        const wasAuthing = this.attempts === 0;
        this.attempts = 0;
        this.cb.onDeviceInfo?.(msg);
        if (wasAuthing || this.ws?.readyState === WebSocket.OPEN) {
          this.cb.onStatus?.('ready');
        }
        this.startHeartbeat();
        break;
      }
      case 'error':
        this.cb.onError?.(msg.msg);
        break;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // {t:"state"} acts as a heartbeat and also refreshes device status
    this.heartbeatTimer = setInterval(() => this.send({ t: 'state' }), HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
    this.cb.onStatus?.('reconnecting');
    this.attempts++;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts, 4));
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearHello() {
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
  }

  private clearTimers() {
    this.clearHello();
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      const ws = this.ws;
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      this.ws = null;
    }
  }
}
