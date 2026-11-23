// Tipi minimi Web Bluetooth (sottoinsieme di quanto serve all'app).
// Evita la dipendenza @types/web-bluetooth; le interfacce si fondono con
// lib.dom quando il browser le espone.

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
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValueWithResponse?(value: BufferSource): Promise<void>;
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
