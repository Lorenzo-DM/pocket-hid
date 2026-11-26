// Connessione simulata per la modalità debug: nessun ESP richiesto.
// Simula handshake (hello/welcome), risponde agli heartbeat `state` e
// logga ogni messaggio nel log di debug on-screen.

import type { ConnectionCallbacks, ConnStatus, DeviceLink } from './connection';
import type { DeviceInfo, InMsg, MacroStep, OutMsg } from './messages';
import { debugLog } from './debug';

// Nella demo la lista macro vive qui: save/del la modificano e il successivo
// state la restituisce, come farebbe l'ESP.
const fakeDevice: DeviceInfo = {
  fw: '0.3.0-demo',
  layout: 'us',
  usb: 'mounted',
  macros: ['youtube', 'copy-url'],
};

export class MockConnection implements DeviceLink {
  private cb: ConnectionCallbacks = {};
  private timers: ReturnType<typeof setTimeout>[] = [];
  private closed = true;
  private device: DeviceInfo = { ...fakeDevice, macros: [...fakeDevice.macros] };
  private macroSteps = new Map<string, MacroStep[]>([
    ['youtube', [{ s: 'youtube.com' }, { k: 0x28 }]],
    ['copy-url', [{ k: 0x0f, m: 1 }, { w: 100 }, { k: 0x06, m: 1 }]],
  ]);
  private runningMacro: string | null = null;
  private msgListeners = new Set<(msg: InMsg) => void>();

  private emit(msg: InMsg) {
    debugLog('rx', JSON.stringify(msg));
    this.msgListeners.forEach((fn) => fn(msg));
  }

  onMessage(fn: (msg: InMsg) => void): () => void {
    this.msgListeners.add(fn);
    return () => this.msgListeners.delete(fn);
  }

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
      debugLog('rx', JSON.stringify({ t: 'welcome', ...this.device }));
      this.cb.onDeviceInfo?.(this.device);
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

    switch (msg.t) {
      case 'state':
        // heartbeat: la demo risponde come farebbe l'ESP
        this.later(30, () => {
          if (this.closed) return;
          debugLog('rx', JSON.stringify({ t: 'state', ...this.device }));
          this.cb.onDeviceInfo?.(this.device);
        });
        break;

      case 'layout':
        this.device = { ...this.device, layout: msg.layout };
        debugLog('info', `demo: layout set to ${msg.layout}`);
        this.later(30, () => {
          if (this.closed) return;
          this.emit({ t: 'state', ...this.device });
          this.cb.onDeviceInfo?.(this.device);
        });
        break;

      case 'macro_save':
        if (!this.device.macros.includes(msg.id) && this.device.macros.length >= 12) {
          this.later(30, () => this.cb.onError?.('demo: macro limit reached'));
          break;
        }
        this.macroSteps.set(msg.id, msg.steps);
        this.device = {
          ...this.device,
          macros: this.device.macros.includes(msg.id)
            ? this.device.macros
            : [...this.device.macros, msg.id],
        };
        debugLog('info', `demo: macro "${msg.id}" saved (${msg.steps.length} steps)`);
        this.later(30, () => {
          if (this.closed) return;
          this.emit({ t: 'state', ...this.device });
          this.cb.onDeviceInfo?.(this.device);
        });
        break;

      case 'macro_del':
        this.macroSteps.delete(msg.id);
        this.device = {
          ...this.device,
          macros: this.device.macros.filter((m) => m !== msg.id),
        };
        this.later(30, () => {
          if (this.closed) return;
          this.emit({ t: 'state', ...this.device });
          this.cb.onDeviceInfo?.(this.device);
        });
        break;

      case 'macro_run':
        if (this.runningMacro) {
          this.later(30, () => this.cb.onError?.('demo: macro already running'));
          break;
        }
        this.runningMacro = msg.id;
        debugLog('info', `demo: running macro "${msg.id}"…`);
        this.later(700, () => {
          this.runningMacro = null;
          if (this.closed) return;
          this.emit({ t: 'macro_done', id: msg.id });
        });
        break;

      case 'macro_get':
        this.later(30, () => {
          if (this.closed) return;
          this.emit({ t: 'macro_data', id: msg.id, steps: this.macroSteps.get(msg.id) ?? [] });
        });
        break;
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
