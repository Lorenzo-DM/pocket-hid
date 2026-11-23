// Connessione simulata per la modalità debug: nessun ESP richiesto.
// Simula handshake (hello/welcome), risponde agli heartbeat `state` e
// logga ogni messaggio nel log di debug on-screen.

import type { ConnectionCallbacks, ConnStatus, DeviceLink } from './connection';
import type { DeviceInfo, OutMsg } from './messages';
import { debugLog } from './debug';

const FAKE_DEVICE: DeviceInfo = {
  fw: '0.2.0-demo',
  layout: 'us',
  usb: 'mounted',
  macros: [],
};

export class MockConnection implements DeviceLink {
  private cb: ConnectionCallbacks = {};
  private timers: ReturnType<typeof setTimeout>[] = [];
  private closed = true;

  setCallbacks(cb: ConnectionCallbacks) {
    this.cb = cb;
  }

  connect(_url: string, token = '') {
    this.disconnect();
    this.closed = false;
    debugLog('info', `demo: connect("${_url}"${token ? ', token=***' : ''})`);
    this.later(150, () => this.status('connecting'));
    this.later(350, () => this.status('authing'));
    this.later(600, () => {
      if (this.closed) return;
      debugLog('rx', JSON.stringify({ t: 'welcome', ...FAKE_DEVICE }));
      this.cb.onDeviceInfo?.(FAKE_DEVICE);
      this.status('ready');
    });
  }

  disconnect() {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.cb.onStatus) {
      this.cb.onStatus('closed');
      debugLog('info', 'demo: disconnected');
    }
  }

  send(msg: OutMsg): boolean {
    if (this.closed) return false;
    debugLog('tx', JSON.stringify(msg));

    // heartbeat: la demo risponde come farebbe l'ESP
    if (msg.t === 'state') {
      this.later(30, () => {
        if (!this.closed) debugLog('rx', JSON.stringify({ t: 'state', ...FAKE_DEVICE }));
      });
    }
    return true;
  }

  private status(s: ConnStatus) {
    if (this.closed && s !== 'closed') return;
    this.cb.onStatus?.(s);
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }
}
