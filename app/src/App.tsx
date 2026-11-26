import { useState } from 'react';
import { useConnection } from './hooks/useConnection';
import { usePrefs, useWakeLock } from './hooks/usePrefs';
import { ConnectView } from './components/ConnectView';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { TrackpadView } from './components/TrackpadView';
import { MediaView } from './components/MediaView';
import { KeyboardView } from './components/KeyboardView';
import { MacroView } from './components/MacroView';
import { DebugLog } from './components/DebugLog';
import { IconKeyboard, IconMacro, IconRemote, IconTrackpad } from './components/Icons';

type Tab = 'trackpad' | 'remote' | 'keyboard' | 'macro';

const TABS: { id: Tab; label: string }[] = [
  { id: 'trackpad', label: 'Trackpad' },
  { id: 'remote', label: 'Remote' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'macro', label: 'Macros' },
];

export default function App() {
  const {
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
  } = useConnection();

  const { prefs, updatePref, vibrate } = usePrefs();
  const [tab, setTab] = useState<Tab>('trackpad');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const showRemote = sessionActive || status === 'ready';
  useWakeLock(showRemote && prefs.wakeLock);

  return (
    <div className="app">
      {!showRemote && (
        <ConnectView
          conn={conn}
          transport={transport}
          status={status}
          statusDetail={statusDetail}
          onSwitchTransport={switchTransport}
        />
      )}

      {showRemote && (
        <>
          <StatusBar
            status={status}
            device={device}
            transport={transport}
            onOpenSettings={() => setSettingsOpen(true)}
            onDisconnect={disconnect}
          />

          <main className={`main-view tab-${tab}`}>
            {tab === 'trackpad' && (
              <TrackpadView conn={conn} prefs={prefs} vibrate={vibrate} />
            )}
            {tab === 'remote' && (
              <MediaView conn={conn} vibrate={vibrate} />
            )}
            {tab === 'keyboard' && (
              <KeyboardView
                conn={conn}
                prefs={prefs}
                layout={device?.layout ?? 'us'}
                vibrate={vibrate}
              />
            )}
            {tab === 'macro' && (
              <MacroView
                conn={conn}
                macros={device?.macros ?? []}
                prefs={prefs}
                layout={device?.layout ?? 'us'}
                vibrate={vibrate}
                onToast={showToast}
              />
            )}
          </main>

          <nav className="bottom-nav" aria-label="Navigation">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`nav-item ${tab === t.id ? 'active' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => {
                  setTab(t.id);
                  vibrate(6);
                }}
              >
                <span className="nav-icon">
                  {t.id === 'trackpad' && <IconTrackpad size={21} />}
                  {t.id === 'remote' && <IconRemote size={21} />}
                  {t.id === 'keyboard' && <IconKeyboard size={21} />}
                  {t.id === 'macro' && <IconMacro size={21} />}
                </span>
                <span className="nav-label">{t.label}</span>
              </button>
            ))}
          </nav>

          <SettingsModal
            open={settingsOpen}
            device={device}
            transport={transport}
            prefs={prefs}
            onUpdatePref={updatePref}
            onSetLayout={(layout) => {
              conn.send({ t: 'layout', layout });
              vibrate(8);
              showToast(`Keyboard layout set to ${layout.toUpperCase()}`);
            }}
            onClose={() => setSettingsOpen(false)}
            onDisconnect={disconnect}
          />
        </>
      )}

      {toast && (
        <div
          className={`toast ${toast.kind} ${showRemote ? 'above-nav' : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      )}

      {transport === 'demo' && <DebugLog aboveNav={showRemote} />}
    </div>
  );
}
