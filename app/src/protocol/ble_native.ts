// Client BLE su guscio Capacitor (Android), via @capacitor-community/bluetooth-le.
// Richiede i permessi dichiarati in AndroidManifest.xml (richiesti dal plugin
// al runtime al primo scan). Il plugin spezza le write oltre l'MTU e il
// firmware accumula i JSON multi-write, quindi i chunk sono trasparenti.

import {
  BleClient,
  ConnectionPriority,
  numbersToDataView,
  type BleDevice,
} from '@capacitor-community/bluetooth-le';
import { BleBase, BLE_SVC, BLE_RX, BLE_TX } from './ble_base';

// dimensione di write affidabile: MTU 247 negoziato col firmware (247-3)
const CHUNK = 244;

export class NativeBleLink extends BleBase {
  private device: BleDevice | null = null;
  private connected = false;

  protected async open() {
    this.status('connecting');

    try {
      await BleClient.initialize({ androidNeverForLocation: true });

      if (!this.device) {
        this.device = await BleClient.requestDevice({
          services: [BLE_SVC],
          // il plugin chiede i permessi runtime al primo requestDevice
        });
      }

      this.status('authing');
      const id = this.device.deviceId;
      // onDisconnect: l'ID resta valido per la riconnessione
      await BleClient.connect(id, () => this.onLinkLost());

      // interval rapido per il mouse (high = ~11-15ms)
      await BleClient.requestConnectionPriority(id, ConnectionPriority.CONNECTION_PRIORITY_HIGH).catch(() => undefined);

      await BleClient.startNotifications(id, BLE_SVC, BLE_TX, (value) => {
        this.handleNotify(value);
      });

      this.connected = true;
      this.sendHello();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.handleError(`BLE: ${msg}`);
    }
  }

  protected writeRaw(data: Uint8Array, urgent: boolean) {
    if (!this.device || !this.connected) return;
    const id = this.device.deviceId;
    const toView = (bytes: Uint8Array) => numbersToDataView(Array.from(bytes));

    if (data.length <= CHUNK) {
      const call = urgent ? BleClient.writeWithoutResponse : BleClient.write;
      void call(id, BLE_SVC, BLE_RX, toView(data)).catch(() => undefined);
      return;
    }

    // messaggio grande (es. macro_save): chunk con write affidabile in ordine
    void (async () => {
      try {
        for (let off = 0; off < data.length; off += CHUNK) {
          await BleClient.write(id, BLE_SVC, BLE_RX, toView(data.subarray(off, off + CHUNK)));
        }
      } catch {
        this.cb.onError?.('write BLE non riuscito');
      }
    })();
  }

  protected releaseDevice() {
    if (this.device) {
      void BleClient.disconnect(this.device.deviceId).catch(() => undefined);
    }
    this.device = null;
    this.connected = false;
  }
}
