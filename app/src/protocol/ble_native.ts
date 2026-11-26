// BLE client for Capacitor (Android) via @capacitor-community/bluetooth-le.
// Requires permissions declared in AndroidManifest.xml (requested at runtime
// on first scan). Large messages are chunked to MTU-3 and reassembled by firmware.

import {
  BleClient,
  ConnectionPriority,
  numbersToDataView,
  type BleDevice,
} from '@capacitor-community/bluetooth-le';
import { BleBase, BLE_SVC, BLE_RX, BLE_TX } from './ble_base';

// Reliable write chunk size: MTU 247 negotiated with firmware (247 - 3)
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
          // Plugin requests runtime permissions on first requestDevice
        });
      }

      this.status('authing');
      const id = this.device.deviceId;
      // onDisconnect: deviceId remains valid for reconnection
      await BleClient.connect(id, () => this.onLinkLost());

      // Fast connection interval for smooth mouse movement (high = ~11-15ms)
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

    // Large message (e.g. macro_save): send ordered chunks with reliable writes
    void (async () => {
      try {
        for (let off = 0; off < data.length; off += CHUNK) {
          await BleClient.write(id, BLE_SVC, BLE_RX, toView(data.subarray(off, off + CHUNK)));
        }
      } catch {
        this.cb.onError?.('BLE write failed');
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
