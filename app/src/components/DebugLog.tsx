import { useState, useSyncExternalStore } from 'react';
import { clearDebugLog, getDebugLog, subscribeDebugLog } from '../protocol/debug';

// Pannello flottante con gli ultimi messaggi tx/rx (solo modalità debug).

export function DebugLog() {
  const [open, setOpen] = useState(false);
  const lines = useSyncExternalStore(subscribeDebugLog, getDebugLog);
  const visible = open ? lines.slice(-14) : [];

  return (
    <div className="debuglog">
      {open && (
        <div className="debuglog-panel">
          <div className="debuglog-head">
            <span>Log messaggi ({lines.length})</span>
            <button className="link" onClick={clearDebugLog}>svuota</button>
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
        className={`debuglog-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        title="Log messaggi (modalità debug)"
      >
        🐞
      </button>
    </div>
  );
}
