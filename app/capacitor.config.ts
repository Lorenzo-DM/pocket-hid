import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.pockethid.app',
  appName: 'PocketHID',
  webDir: 'dist',
  // BLE plugin: evita che lo scan richieda i servizi di localizzazione
  plugins: {
    BluetoothLe: {
      displayUuidsInScanResults: false,
    },
  },
};

export default config;
