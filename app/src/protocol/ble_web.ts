// BLE client via Web Bluetooth (Chrome/Edge desktop + Android).
// requestDevice requires a user gesture only on the first pick; reconnecting
// reuses the previously selected device without another gesture.

import { BleBase, BLE_SVC, BLE_RX, BLE_TX } from './ble_base';

// Above this size, use long write (with response), which the OS fragments;
// below it, use write-without-response for minimal latency.
const FAST_WRITE_MAX = 244;

export class WebBleLink extends BleBase {
  private device: BluetoothDevice | null = null;
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null;
  private txChar: BluetoothRemoteGATTCharacteristic | null = null;

  protected async open() {
    this.status('connecting');

    if (!navigator.bluetooth) {
      this.handleError(
        'Web Bluetooth unavailable: use Chrome/Edge (desktop or Android), or the native Android app.'
      );
      return;
    }

    try {
      if (!this.device) {
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [BLE_SVC] }],
        });
        this.device.addEventListener('gattserverdisconnected', () => {
          this.rxChar = null;
          this.txChar = null;
          this.onLinkLost();
        });
      }
      if (!this.device.gatt) throw new Error('GATT unavailable');

      this.status('authing');
      const server = await this.device.gatt.connect();
      const svc = await server.getPrimaryService(BLE_SVC);
      this.txChar = await svc.getCharacteristic(BLE_TX);
      this.rxChar = await svc.getCharacteristic(BLE_RX);
      await this.txChar.startNotifications();
      this.txChar.addEventListener('characteristicvaluechanged', (ev) => {
        const ch = ev.target as BluetoothRemoteGATTCharacteristic;
        if (ch.value) this.handleNotify(ch.value);
      });

      // Handshake (pairing already completed: encrypted write accepted)
      this.sendHello();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.handleError(`BLE: ${msg}`);
    }
  }

  protected writeRaw(data: Uint8Array, urgent: boolean) {
    const ch = this.rxChar;
    if (!ch) return;
    if (urgent && ch.properties.writeWithoutResponse && data.length <= FAST_WRITE_MAX) {
      ch.writeValueWithoutResponse?.(data).catch(() => undefined);
    } else if (ch.properties.write) {
      ch.writeValueWithResponse?.(data).catch(() => this.cb.onError?.('BLE write failed'));
    } else {
      ch.writeValue(data).catch(() => undefined);
    }
  }

  protected releaseDevice() {
    this.device?.gatt.disconnect();
    this.device = null;
    this.rxChar = null;
    this.txChar = null;
  }
}
