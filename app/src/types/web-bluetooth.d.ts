// Minimal Web Bluetooth types (subset used by this app).
// Avoids depending on @types/web-bluetooth; interfaces merge with lib.dom
// when exposed by the browser.

interface BluetoothRemoteGATTProperties {
  write?: boolean;
  writeWithoutResponse?: boolean;
  notify?: boolean;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly properties: BluetoothRemoteGATTProperties;
  readonly value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: Uint8Array | DataView): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array | DataView): Promise<void>;
  writeValueWithResponse?(value: Uint8Array | DataView): Promise<void>;
}

interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristic(uuid: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string | number): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt: BluetoothRemoteGATTServer;
}

interface Bluetooth {
  requestDevice(options?: {
    filters?: { services?: (string | number)[]; name?: string; namePrefix?: string }[];
    optionalServices?: (string | number)[];
  }): Promise<BluetoothDevice>;
  getAvailability?(): Promise<boolean>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
