import { useEffect, useRef } from 'react';
import type { DeviceInfo } from '../protocol/messages';
import { isServedByEsp, type Transport } from '../hooks/useConnection';
import type { Prefs } from '../hooks/usePrefs';
import { IconClose, IconPower } from './Icons';

interface Props {
  open: boolean;
  device: DeviceInfo | null;
  transport: Transport;
  prefs: Prefs;
  onUpdatePref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  onSetLayout: (layout: 'us' | 'it') => void;
  onClose: () => void;
  onDisconnect: () => void;
}

export function SettingsModal({
  open,
  device,
  transport,
  prefs,
  onUpdatePref,
  onSetLayout,
  onClose,
  onDisconnect,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  const showEspLinks = transport === 'ws' && isServedByEsp();

  return (
    <dialog
      ref={ref}
      className="modal-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-sheet">
        <div className="modal-head">
          <h2>Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={20} />
          </button>
        </div>

        <div className="modal-body">
          {device && (
            <section className="settings-group">
              <h3>Device</h3>
              <div className="info-grid">
                <div className="info-chip">
                  <span className="info-k">Firmware</span>
                  <span className="info-v">{device.fw}</span>
                </div>
                <div className="info-chip">
                  <span className="info-k">USB HID</span>
                  <span className={`info-v ${device.usb === 'mounted' ? 'ok' : 'bad'}`}>
                    {device.usb === 'mounted' ? 'Connected' : 'Unmounted'}
                  </span>
                </div>
                <div className="info-chip">
                  <span className="info-k">Layout</span>
                  <span className="info-v">{device.layout.toUpperCase()}</span>
                </div>
                <div className="info-chip">
                  <span className="info-k">Transport</span>
                  <span className="info-v">{transport.toUpperCase()}</span>
                </div>
              </div>
            </section>
          )}

          <section className="settings-group">
            <h3>Trackpad</h3>
            <label className="range-row">
              <div className="range-head">
                <span>Pointer sensitivity</span>
                <span className="range-val">{prefs.sensitivity.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.1}
                value={prefs.sensitivity}
                onChange={(e) => onUpdatePref('sensitivity', Number(e.target.value))}
              />
            </label>

            <label className="range-row">
              <div className="range-head">
                <span>Scroll speed</span>
                <span className="range-val">{prefs.scrollSpeed.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={prefs.scrollSpeed}
                onChange={(e) => onUpdatePref('scrollSpeed', Number(e.target.value))}
              />
            </label>

            <label className="toggle-row">
              <span>
                Natural scrolling
                <small>Moves content in the direction of your finger</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefs.naturalScroll}
                onChange={(e) => onUpdatePref('naturalScroll', e.target.checked)}
              />
            </label>
          </section>

          <section className="settings-group">
            <h3>Target Keyboard</h3>
            <div className="range-row">
              <div className="range-head">
                <span>Target PC keyboard layout</span>
                <span className="range-val">{(device?.layout ?? 'us').toUpperCase()}</span>
              </div>
              <div className="segmented compact" role="tablist" aria-label="Keyboard layout">
                <button
                  type="button"
                  role="tab"
                  aria-selected={device?.layout === 'it'}
                  className={`seg-btn ${device?.layout === 'it' ? 'active' : ''}`}
                  onClick={() => onSetLayout('it')}
                >
                  Italian (IT)
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={(device?.layout ?? 'us') !== 'it'}
                  className={`seg-btn ${(device?.layout ?? 'us') !== 'it' ? 'active' : ''}`}
                  onClick={() => onSetLayout('us')}
                >
                  English (US)
                </button>
              </div>
            </div>

            {device?.layout !== 'it' && (
              <label className="toggle-row">
                <span>
                  Transliterate accented characters
                  <small>On US layout converts à, è, ò… to ASCII (a&apos;, e&apos;, o&apos;)</small>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  checked={prefs.transliterate}
                  onChange={(e) => onUpdatePref('transliterate', e.target.checked)}
                />
              </label>
            )}
          </section>

          <section className="settings-group">
            <h3>Experience</h3>
            <label className="toggle-row">
              <span>
                Haptic feedback
                <small>Subtle vibration on clicks and keys (if supported)</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefs.haptics}
                onChange={(e) => onUpdatePref('haptics', e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <span>
                Keep screen awake
                <small>Prevents screen sleep while using the remote</small>
              </span>
              <input
                type="checkbox"
                className="switch"
                checked={prefs.wakeLock}
                onChange={(e) => onUpdatePref('wakeLock', e.target.checked)}
              />
            </label>
          </section>

          {showEspLinks && (
            <section className="settings-group">
              <h3>ESP32 Tools</h3>
              <div className="esp-links">
                <a className="btn-secondary" href="/portal">
                  WiFi Setup
                </a>
                <a className="btn-secondary" href="/update">
                  OTA Update
                </a>
              </div>
            </section>
          )}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="btn-danger full"
            onClick={() => {
              onClose();
              onDisconnect();
            }}
          >
            <IconPower size={18} />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    </dialog>
  );
}
