import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Connection, type ConnStatus, type DeviceLink } from '../protocol/connection';
import { WebBleLink } from '../protocol/ble_web';
import { NativeBleLink } from '../protocol/ble_native';
import { MockConnection } from '../protocol/mock_connection';
import { isDebugMode, setDebugMode } from '../protocol/debug';
import type { DeviceInfo } from '../protocol/messages';

export type Transport = 'ws' | 'ble' | 'demo';
const TRANSPORT_KEY = 'mk.transport';

export function currentTransport(): Transport {
  try {
    if (isDebugMode()) return 'demo';
    const t = localStorage.getItem(TRANSPORT_KEY);
    if (t === 'ble' || t === 'ws') return t;
  } catch {
    // storage non disponibile
  }
  return 'ws';
}

export function setTransport(t: Exclude<Transport, 'demo'>) {
  try {
    localStorage.setItem(TRANSPORT_KEY, t);
    setDebugMode(false);
  } catch {
    // storage non disponibile
  }
}

export function useConnection() {
  const connRef = useRef<DeviceLink | null>(null);
  if (!connRef.current) {
    switch (currentTransport()) {
      case 'demo':
        connRef.current = new MockConnection();
        break;
      case 'ble':
        // Web Bluetooth su WebView nativo non c'e': usa il plugin Capacitor
        connRef.current = Capacitor.isNativePlatform() ? new NativeBleLink() : new WebBleLink();
        break;
      default:
        connRef.current = new Connection();
    }
  }
  const conn = connRef.current;

  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [device, setDevice] = useState<DeviceInfo | null>(null);

  useEffect(() => {
    conn.setCallbacks({
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail);
      },
      onDeviceInfo: setDevice,
      onError: () => {
        // gli errori ESP vengono mostrati come toast minimo: qui li logghiamo
        // (potranno diventare una toast queue in una fase successiva)
      },
    });
    return () => conn.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { conn, status, statusDetail, device, debug: isDebugMode(), transport: currentTransport() };
}
