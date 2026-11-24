import { useState, useSyncExternalStore } from 'react';
import { clearDebugLog, getDebugLog, subscribeDebugLog } from '../protocol/debug';
import { IconBug } from './Icons';

// Pannello flottante con gli ultimi messaggi tx/rx (solo modalità debug).

export function DebugLog({ aboveNav = false }: { aboveNav?: boolean }) {
  const [open, setOpen] = useState(false);
  const lines = useSyncExternalStore(subscribeDebugLog, getDebugLog);
  const visible = open ? lines.slice(-14) : [];

  return (
    <div className={`debuglog ${aboveNav ? 'above-nav' : ''}`}>
      {open && (
        <div className="debuglog-panel">
          <div className="debuglog-head">
            <span>Log messaggi ({lines.length})</span>
            <button type="button" className="link" onClick={clearDebugLog}>
              svuota
            </button>
          </div>
          {visible.length === 0 && <div className="muted">nessun messaggio</div>}
          {visible.map((l, i) => (
            <div key={i} className={`debuglog-line ${l.dir}`}>
              <span className="debuglog-time">{l.time}</span>
              <span className="debuglog-dir">{l.dir.toUpperCase()}</span>
              <span className="debuglog-text">{l.text}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`debuglog-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label="Log messaggi debug"
        title="Log messaggi (modalità debug)"
      >
        <IconBug size={18} />
      </button>
    </div>
  );
}
