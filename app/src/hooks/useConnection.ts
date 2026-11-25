import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Connection, type ConnStatus, type DeviceLink } from '../protocol/connection';
import { WebBleLink } from '../protocol/ble_web';
import { NativeBleLink } from '../protocol/ble_native';
import { MockConnection } from '../protocol/mock_connection';
import { isDebugMode, setDebugMode } from '../protocol/debug';
import type { DeviceInfo } from '../protocol/messages';

export type Transport = 'ws' | 'ble' | 'demo';

const TRANSPORT_KEY = 'mk.transport';
export const URL_KEY = 'mk.url';
export const TOKEN_KEY = 'mk.token';

export function isServedByEsp(): boolean {
  return (
    location.protocol.startsWith('http') &&
    !['localhost', '127.0.0.1', ''].includes(location.hostname)
  );
}

export function defaultWsUrl(): string {
  if (isServedByEsp()) {
    return `ws://${location.host}/ws`;
  }
  return 'ws://pockethid.local/ws';
}

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

function persistTransport(t: Transport) {
  try {
    if (t === 'demo') {
      setDebugMode(true);
      localStorage.removeItem(TRANSPORT_KEY);
    } else {
      setDebugMode(false);
      localStorage.setItem(TRANSPORT_KEY, t);
    }
  } catch {
    // storage non disponibile
  }
}

function createLink(t: Transport): DeviceLink {
  switch (t) {
    case 'demo':
      return new MockConnection();
    case 'ble':
      // Web Bluetooth su WebView nativo non c'è: usa il plugin Capacitor
      return Capacitor.isNativePlatform() ? new NativeBleLink() : new WebBleLink();
    default:
      return new Connection();
  }
}

export interface ToastMsg {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export function useConnection() {
  const [transport, setTransportState] = useState<Transport>(currentTransport);
  const [conn, setConn] = useState<DeviceLink>(() => createLink(currentTransport()));

  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [toast, setToast] = useState<ToastMsg | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastSeq = useRef(0);
  const autoTriedRef = useRef(false);

  const showToast = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    const id = ++toastSeq.current;
    setToast({ id, text, kind });
    toastTimer.current = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, kind === 'error' ? 4000 : 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    conn.setCallbacks({
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail);
        if (s === 'ready') {
          setSessionActive(true);
        } else if (s === 'closed') {
          setSessionActive(false);
          setDevice(null);
        }
      },
      onDeviceInfo: setDevice,
      onError: (msg) => showToast(msg, 'error'),
    });

    // Auto-connessione trasparente quando la PWA è servita direttamente dall'ESP
    if (!autoTriedRef.current && transport === 'ws' && isServedByEsp()) {
      autoTriedRef.current = true;
      const savedUrl = localStorage.getItem(URL_KEY) ?? defaultWsUrl();
      const savedToken = localStorage.getItem(TOKEN_KEY) ?? '';
      conn.connect(savedUrl, savedToken);
    }

    return () => {
      conn.setCallbacks({});
      conn.disconnect();
    };
  }, [conn, transport, showToast]);

  const switchTransport = useCallback(
    (next: Transport) => {
      if (next === transport) return;
      persistTransport(next);
      setStatus('idle');
      setStatusDetail(undefined);
      setDevice(null);
      setSessionActive(false);
      setTransportState(next);
      setConn(createLink(next));
    },
    [transport]
  );

  const disconnect = useCallback(() => {
    conn.disconnect();
    setSessionActive(false);
    setDevice(null);
  }, [conn]);

  return {
    conn,
    status,
    statusDetail,
    device,
    transport,
    sessionActive,
    toast,
    showToast,
    switchTransport,
    disconnect,
  };
}
