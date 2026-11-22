import { useState } from 'react';
import { useConnection } from './hooks/useConnection';
import { ConnectView } from './components/ConnectView';
import { StatusBar } from './components/StatusBar';
import { KeyboardView } from './components/KeyboardView';
import { TextView } from './components/TextView';

type Tab = 'keyboard' | 'text';

export default function App() {
  const { conn, status, statusDetail, device } = useConnection();
  const [tab, setTab] = useState<Tab>('keyboard');

  const connected = status === 'ready';

  return (
    <div className="app">
      {!connected && (
        <ConnectView conn={conn} statusDetail={statusDetail} />
      )}

      {connected && (
        <>
          <StatusBar
            status={status}
            device={device}
            onDisconnect={() => conn.disconnect()}
          />
          <nav className="tabs">
            <button className={tab === 'keyboard' ? 'active' : ''} onClick={() => setTab('keyboard')}>
              Tastiera
            </button>
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
              Testo
            </button>
          </nav>
          <main>
            {tab === 'keyboard' && <KeyboardView conn={conn} />}
            {tab === 'text' && <TextView conn={conn} />}
          </main>
        </>
      )}
    </div>
  );
}
