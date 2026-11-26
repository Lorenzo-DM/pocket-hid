import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.pockethid.app',
  appName: 'PocketHID',
  webDir: 'dist',
  // BLE plugin: avoid requiring location services for scanning
  plugins: {
    BluetoothLe: {
      displayUuidsInScanResults: false,
    },
  },
};

export default config;
