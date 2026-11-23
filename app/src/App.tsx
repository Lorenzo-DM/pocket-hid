import { useState } from 'react';
import { useConnection } from './hooks/useConnection';
import { ConnectView } from './components/ConnectView';
import { StatusBar } from './components/StatusBar';
import { KeyboardView } from './components/KeyboardView';
import { TextView } from './components/TextView';
import { TrackpadView } from './components/TrackpadView';
import { MediaView } from './components/MediaView';
import { MacroView } from './components/MacroView';
import { DebugLog } from './components/DebugLog';

type Tab = 'trackpad' | 'keyboard' | 'media' | 'macro' | 'text';

export default function App() {
  const { conn, status, statusDetail, device, debug } = useConnection();
  const [tab, setTab] = useState<Tab>('trackpad');

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
            debug={debug}
            onDisconnect={() => conn.disconnect()}
          />
          <nav className="tabs">
            <button className={tab === 'trackpad' ? 'active' : ''} onClick={() => setTab('trackpad')}>
              Trackpad
            </button>
            <button className={tab === 'keyboard' ? 'active' : ''} onClick={() => setTab('keyboard')}>
              Tastiera
            </button>
            <button className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
              Media
            </button>
            <button className={tab === 'macro' ? 'active' : ''} onClick={() => setTab('macro')}>
              Macro
            </button>
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}>
              Testo
            </button>
          </nav>
          <main>
            {tab === 'trackpad' && <TrackpadView conn={conn} />}
            {tab === 'keyboard' && <KeyboardView conn={conn} />}
            {tab === 'media' && <MediaView conn={conn} />}
            {tab === 'macro' && <MacroView conn={conn} macros={device?.macros ?? []} />}
            {tab === 'text' && <TextView conn={conn} />}
          </main>
        </>
      )}

      {debug && <DebugLog />}
    </div>
  );
}
