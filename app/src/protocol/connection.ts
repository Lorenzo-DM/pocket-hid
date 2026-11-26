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

const CONNECT_TIMEOUT_MS = 6000;
const HELLO_TIMEOUT_MS = 4000;
const HEARTBEAT_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 5000;
const MAX_BACKOFF_MS = 15000;
const MAX_RECONNECTS = 5;

const FATAL_ERROR_RE = /invalid token|unsupported protocol|too many connected/i;

export class Connection {
  private ws: WebSocket | null = null;
  private url = '';
  private token = '';
  private attempts = 0;
  private hasConnected = false;
  private manualClose = false;
  private fatalError: string | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.fatalError = null;
    this.hasConnected = false;
    this.url = url;
    this.token = token;
    this.attempts = 0;
    this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.hasConnected = false;
    this.fatalError = null;
    this.clearTimers();
    this.cleanupSocket();
    this.cb.onStatus?.('closed');
  }

  send(msg: OutMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(serialize(msg));
      return true;
    } catch {
      return false;
    }
  }

  // --- internals ---

  private open() {
    this.cleanupSocket();
    this.clearTimers();
    this.cb.onStatus?.(this.attempts > 0 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      this.cb.onStatus?.('error', `Invalid URL: ${String(e)}`);
      return;
    }
    this.ws = ws;

    this.connectTimer = setTimeout(() => {
      if (this.ws !== ws) return;
      this.cleanupSocket();
      this.handleFailure('Connection timed out. Check that the ESP32 is powered on and reachable.');
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.clearConnectTimer();
      this.cb.onStatus?.('authing');
      ws.send(serialize({ t: 'hello', v: 1, token: this.token }));
      this.helloTimer = setTimeout(() => {
        if (this.ws !== ws) return;
        this.cleanupSocket();
        this.handleFailure('No handshake response from ESP32 (hello timeout)');
      }, HELLO_TIMEOUT_MS);
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.clearHeartbeatTimeout();
      if (typeof ev.data !== 'string') return;
      const msg = parseInMsg(ev.data);
      if (!msg) return;
      this.handleIn(msg);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.manualClose || this.fatalError) return;
      this.handleFailure('Unable to connect to ESP32. Check the URL and WiFi network.');
    };

    ws.onerror = () => {
      // onclose will follow and handle error / reconnection
    };
  }

  private handleIn(msg: InMsg) {
    this.msgListeners.forEach((fn) => fn(msg));
    switch (msg.t) {
      case 'welcome':
      case 'state': {
        this.clearHello();
        this.hasConnected = true;
        this.attempts = 0;
        this.cb.onDeviceInfo?.(msg);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.cb.onStatus?.('ready');
        }
        this.startHeartbeat();
        break;
      }
      case 'error':
        if (FATAL_ERROR_RE.test(msg.msg)) {
          this.fatalError = msg.msg;
          this.clearTimers();
          this.cleanupSocket();
          this.cb.onError?.(msg.msg);
          this.cb.onStatus?.('error', msg.msg);
        } else {
          this.cb.onError?.(msg.msg);
        }
        break;
    }
  }

  private handleFailure(initialErrorMsg: string) {
    if (this.manualClose || this.fatalError) return;
    if (!this.hasConnected) {
      this.cb.onStatus?.('error', initialErrorMsg);
      return;
    }
    this.scheduleReconnect();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // {t:"state"} acts as a heartbeat and also refreshes device status
    this.heartbeatTimer = setInterval(() => {
      if (!this.send({ t: 'state' })) return;
      this.clearHeartbeatTimeout();
      this.heartbeatTimeoutTimer = setTimeout(() => {
        if (this.manualClose) return;
        this.cleanupSocket();
        this.clearTimers();
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

  private scheduleReconnect() {
    if (this.manualClose || this.fatalError) return;
    this.attempts++;
    if (this.attempts > MAX_RECONNECTS) {
      this.cb.onStatus?.('error', 'WiFi reconnect failed: check ESP32 and reconnect');
      return;
    }
    this.cb.onStatus?.('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts, 4));
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private clearConnectTimer() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private clearHello() {
    if (this.helloTimer) {
      clearTimeout(this.helloTimer);
      this.helloTimer = null;
    }
  }

  private clearTimers() {
    this.clearConnectTimer();
    this.clearHello();
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanupSocket() {
    if (this.ws) {
      const ws = this.ws;
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
      this.ws = null;
    }
  }
}
