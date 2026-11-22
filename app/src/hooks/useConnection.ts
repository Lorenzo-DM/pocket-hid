import { useEffect, useRef, useState } from 'react';
import { Connection, type ConnStatus } from '../protocol/connection';
import type { DeviceInfo } from '../protocol/messages';

export function useConnection() {
  const connRef = useRef<Connection | null>(null);
  if (!connRef.current) connRef.current = new Connection();
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

  return { conn, status, statusDetail, device };
}
