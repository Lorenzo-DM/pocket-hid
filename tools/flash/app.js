(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // =========================================================================
  // 1. Unified Workspace Navigation (Flasher / Macro Studio / Remote)
  // =========================================================================

  const VALID_TABS = new Set(['flasher', 'macros', 'remote']);
  let activeTab = 'flasher';
  let remoteLoaded = false;

  function tabFromHash() {
    const raw = (location.hash || '').replace(/^#/, '').toLowerCase();
    return VALID_TABS.has(raw) ? raw : 'flasher';
  }

  function loadRemoteIfNeeded() {
    if (remoteLoaded) return;
    remoteLoaded = true;
    const frame = $('remoteFrame');
    const fallback = $('remoteFallback');

    fetch('./app/index.html', { method: 'HEAD' })
      .then((res) => {
        if (res.ok) {
          frame.src = './app/';
          fallback.classList.remove('visible');
        } else {
          fallback.classList.add('visible');
        }
      })
      .catch(() => {
        // file:// or network restriction: attempt direct iframe load
        frame.src = './app/';
      });
  }

  function switchTab(tab, updateHash = true) {
    if (!VALID_TABS.has(tab)) tab = 'flasher';
    if (activeTab === 'macros' && tab !== 'macros') {
      stopRecording();
    }
    activeTab = tab;

    document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
      const isActive = btn.dataset.tabBtn === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll('.view-panel').forEach((panel) => {
      const isActive = panel.dataset.panel === tab;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });

    document.body.classList.toggle('mode-remote', tab === 'remote');

    if (tab === 'remote') {
      loadRemoteIfNeeded();
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    if (updateHash) {
      const targetHash = '#' + tab;
      if (location.hash !== targetHash) {
        history.replaceState(null, '', targetHash);
      }
    }
  }

  document.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tabBtn));
  });

  document.querySelectorAll('[data-goto-tab]').forEach((el) => {
    el.addEventListener('click', () => switchTab(el.dataset.gotoTab));
  });

  window.addEventListener('hashchange', () => {
    switchTab(tabFromHash(), false);
  });

  // Load firmware version dynamically from manifest.json
  fetch('./manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const badge = $('fwVersion');
      if (!badge || !data?.version) return;
      const ver = String(data.version);
      if (ver && !ver.includes('TEMPLATE')) {
        badge.textContent = ver.startsWith('v') ? ver : 'v' + ver;
      }
    })
    .catch(() => {});

  // =========================================================================
  // 2. Macro Studio
  // =========================================================================

  const STORAGE_KEY = 'mk.studio.macros.v1';
  const BLE_SVC = '7a0c1000-8b6d-4d3f-9a2e-5f1c2b3d4e5f';
  const BLE_RX = '7a0c1001-8b6d-4d3f-9a2e-5f1c2b3d4e5f';

  const MOD = { CTRL: 1, SHIFT: 2, ALT: 4, GUI: 8 };
  const K = {
    A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0a, H: 0x0b,
    I: 0x0c, J: 0x0d, K: 0x0e, L: 0x0f, M: 0x10, N: 0x11, O: 0x12, P: 0x13,
    Q: 0x14, R: 0x15, S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1a, X: 0x1b,
    Y: 0x1c, Z: 0x1d,
    N1: 0x1e, N2: 0x1f, N3: 0x20, N4: 0x21, N5: 0x22,
    N6: 0x23, N7: 0x24, N8: 0x25, N9: 0x26, N0: 0x27,
    ENTER: 0x28, ESC: 0x29, BACKSPACE: 0x2a, TAB: 0x2b, SPACE: 0x2c,
    MINUS: 0x2d, EQUAL: 0x2e, LBRACKET: 0x2f, RBRACKET: 0x30, BACKSLASH: 0x31,
    SEMICOLON: 0x33, QUOTE: 0x34, GRAVE: 0x35, COMMA: 0x36, DOT: 0x37, SLASH: 0x38,
    F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
    F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
    CAPSLOCK: 0x39, PRINTSCREEN: 0x46, SCROLLLOCK: 0x47, PAUSE: 0x48,
    INSERT: 0x49, HOME: 0x4a, PAGEUP: 0x4b,
    DELETE: 0x4c, END: 0x4d, PAGEDOWN: 0x4e,
    RIGHT: 0x4f, LEFT: 0x50, DOWN: 0x51, UP: 0x52,
  };
  const CONSUMER = {
    VOLUME_UP: 0xe9, VOLUME_DOWN: 0xea, MUTE: 0xe2,
    PLAY_PAUSE: 0xcd, STOP: 0xb7, NEXT_TRACK: 0xb5, PREV_TRACK: 0xb6,
    BRIGHTNESS_UP: 0x6f, BRIGHTNESS_DOWN: 0x70, POWER: 0x30,
  };

  const CODE_TO_HID = {
    Enter: K.ENTER, NumpadEnter: K.ENTER, Escape: K.ESC, Backspace: K.BACKSPACE,
    Tab: K.TAB, Space: K.SPACE, Delete: K.DELETE, Insert: K.INSERT,
    Home: K.HOME, End: K.END, PageUp: K.PAGEUP, PageDown: K.PAGEDOWN,
    ArrowRight: K.RIGHT, ArrowLeft: K.LEFT, ArrowDown: K.DOWN, ArrowUp: K.UP,
    Minus: K.MINUS, Equal: K.EQUAL, BracketLeft: K.LBRACKET, BracketRight: K.RBRACKET,
    Backslash: K.BACKSLASH, IntlBackslash: K.BACKSLASH, Semicolon: K.SEMICOLON,
    Quote: K.QUOTE, Backquote: K.GRAVE, Comma: K.COMMA, Period: K.DOT, Slash: K.SLASH,
    CapsLock: K.CAPSLOCK, PrintScreen: K.PRINTSCREEN, ScrollLock: K.SCROLLLOCK, Pause: K.PAUSE,
    NumpadDecimal: K.DOT, NumpadDivide: K.SLASH, NumpadSubtract: K.MINUS,
  };
  for (let i = 0; i < 26; i++) CODE_TO_HID['Key' + String.fromCharCode(65 + i)] = K.A + i;
  for (let i = 1; i <= 9; i++) {
    CODE_TO_HID['Digit' + i] = K.N1 + (i - 1);
    CODE_TO_HID['Numpad' + i] = K.N1 + (i - 1);
  }
  CODE_TO_HID['Digit0'] = K.N0;
  CODE_TO_HID['Numpad0'] = K.N0;
  for (let i = 1; i <= 12; i++) CODE_TO_HID['F' + i] = K.F1 + (i - 1);

  const KEY_OPTIONS = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({ label: l, code: K[l] })),
    ...'1234567890'.split('').map((d) => ({ label: d, code: K['N' + d] })),
    ...Array.from({ length: 12 }, (_, i) => ({ label: 'F' + (i + 1), code: K.F1 + i })),
    { label: 'Enter', code: K.ENTER }, { label: 'Esc', code: K.ESC },
    { label: 'Tab', code: K.TAB }, { label: 'Space', code: K.SPACE },
    { label: 'Backspace', code: K.BACKSPACE }, { label: 'Delete', code: K.DELETE },
    { label: '←', code: K.LEFT }, { label: '→', code: K.RIGHT },
    { label: '↓', code: K.DOWN }, { label: '↑', code: K.UP },
    { label: 'Home', code: K.HOME }, { label: 'End', code: K.END },
    { label: 'PgUp', code: K.PAGEUP }, { label: 'PgDn', code: K.PAGEDOWN },
    { label: 'CapsLock', code: K.CAPSLOCK }, { label: 'PrintScreen', code: K.PRINTSCREEN },
    { label: 'Insert', code: K.INSERT }, { label: 'Pause', code: K.PAUSE },
    { label: '- / _', code: K.MINUS }, { label: '= / +', code: K.EQUAL },
    { label: '[ / {', code: K.LBRACKET }, { label: '] / }', code: K.RBRACKET },
    { label: '/ / ?', code: K.SLASH }, { label: '. / >', code: K.DOT },
    { label: ', / <', code: K.COMMA }, { label: '(Modifiers only)', code: 0 },
  ];

  const MEDIA_OPTIONS = [
    { label: 'Play / Pause', code: CONSUMER.PLAY_PAUSE },
    { label: 'Vol +', code: CONSUMER.VOLUME_UP },
    { label: 'Vol −', code: CONSUMER.VOLUME_DOWN },
    { label: 'Mute', code: CONSUMER.MUTE },
    { label: 'Next track', code: CONSUMER.NEXT_TRACK },
    { label: 'Prev track', code: CONSUMER.PREV_TRACK },
    { label: 'Stop', code: CONSUMER.STOP },
    { label: 'Bright +', code: CONSUMER.BRIGHTNESS_UP },
    { label: 'Bright −', code: CONSUMER.BRIGHTNESS_DOWN },
  ];

  const QUICK_STEPS = [
    { label: 'Ctrl+Alt+T', step: { k: K.T, m: MOD.CTRL | MOD.ALT } },
    { label: 'Win', step: { k: 0, m: MOD.GUI } },
    { label: 'Win+R', step: { k: K.R, m: MOD.GUI } },
    { label: 'Win+L', step: { k: K.L, m: MOD.GUI } },
    { label: 'Alt+Tab', step: { k: K.TAB, m: MOD.ALT } },
    { label: 'Alt+F4', step: { k: K.F4, m: MOD.ALT } },
    { label: 'Ctrl+Shift+Esc', step: { k: K.ESC, m: MOD.CTRL | MOD.SHIFT } },
    { label: 'Enter', step: { k: K.ENTER } },
    { label: '500ms', step: { w: 500 } },
    { label: '1s', step: { w: 1000 } },
    { label: 'Play/Pause', step: { c: CONSUMER.PLAY_PAUSE } },
  ];

  const PRESETS = [
    {
      name: 'Linux: Terminal + top',
      steps: [
        { k: K.T, m: MOD.CTRL | MOD.ALT },
        { w: 800 },
        { s: 'top' },
        { k: K.ENTER },
      ],
    },
    {
      name: 'Linux: Terminal + htop',
      steps: [
        { k: K.T, m: MOD.CTRL | MOD.ALT },
        { w: 800 },
        { s: 'htop' },
        { k: K.ENTER },
      ],
    },
    {
      name: 'Windows: Lock PC',
      steps: [{ k: K.L, m: MOD.GUI }],
    },
    {
      name: 'Windows: PowerShell',
      steps: [
        { k: K.R, m: MOD.GUI },
        { w: 500 },
        { s: 'powershell' },
        { k: K.ENTER },
      ],
    },
    {
      name: 'macOS: Terminal',
      steps: [
        { k: K.SPACE, m: MOD.GUI },
        { w: 400 },
        { s: 'Terminal' },
        { k: K.ENTER },
      ],
    },
  ];

  let macros = loadLibrary();
  let activeIdx = 0;
  let recording = false;
  let lastKeyTime = 0;
  let builderMods = 0;

  if (macros.length === 0) {
    macros = [{ name: 'Linux: Terminal + top', steps: PRESETS[0].steps.map((s) => ({ ...s })) }];
    saveLibrary();
  }

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr)
        ? arr.filter((m) => m && typeof m.name === 'string' && Array.isArray(m.steps))
        : [];
    } catch {
      return [];
    }
  }

  function saveLibrary() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(macros));
    } catch {}
  }

  function setStatus(msg, isErr = false) {
    const el = $('statusBar');
    el.textContent = msg;
    el.className = 'status-bar' + (isErr ? ' err' : '');
  }

  function current() {
    return macros[activeIdx];
  }

  function stepBadge(s) {
    if ('k' in s) return { label: 'KEY', cls: 'is-key' };
    if ('s' in s) return { label: 'TEXT', cls: 'is-text' };
    if ('c' in s) return { label: 'MEDIA', cls: 'is-media' };
    return { label: 'WAIT', cls: 'is-wait' };
  }

  function stepLabel(s) {
    if ('k' in s) {
      const mods = [];
      if (s.m) {
        if (s.m & MOD.CTRL) mods.push('Ctrl');
        if (s.m & MOD.SHIFT) mods.push('Shift');
        if (s.m & MOD.ALT) mods.push('Alt');
        if (s.m & MOD.GUI) mods.push('Win');
      }
      if (s.k === 0) return mods.join('+') || 'Mod';
      const opt = KEY_OPTIONS.find((o) => o.code === s.k);
      const key = opt ? opt.label : '0x' + s.k.toString(16);
      return (mods.length ? mods.join('+') + '+' : '') + key;
    }
    if ('s' in s) return '"' + s.s + '"';
    if ('c' in s) {
      const opt = MEDIA_OPTIONS.find((o) => o.code === s.c);
      return opt ? opt.label : '0x' + s.c.toString(16);
    }
    return s.w + ' ms';
  }

  function renderAll() {
    renderList();
    renderEditor();
  }

  function renderList() {
    const ul = $('macroList');
    ul.innerHTML = '';
    macros.forEach((m, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'macro-item' + (i === activeIdx ? ' active' : '');
      const nameDiv = document.createElement('span');
      nameDiv.className = 'macro-item-name';
      nameDiv.textContent = m.name || '(Untitled)';
      const subDiv = document.createElement('span');
      subDiv.className = 'macro-item-sub';
      subDiv.textContent = String(m.steps.length);
      btn.append(nameDiv, subDiv);
      btn.onclick = () => {
        stopRecording();
        activeIdx = i;
        renderAll();
      };
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  function renderEditor() {
    const m = current();
    $('editorTitle').textContent = m.name || 'Untitled macro';
    $('macroName').value = m.name;
    $('stepCount').textContent = String(m.steps.length);
    $('btnDeleteMacro').disabled = macros.length <= 1;

    const ol = $('stepList');
    ol.innerHTML = '';
    if (m.steps.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-steps';
      li.textContent = 'No steps yet — record from your keyboard or add a step above.';
      ol.appendChild(li);
    } else {
      m.steps.forEach((s, i) => {
        const li = document.createElement('li');
        li.className = 'step-row';
        const badge = stepBadge(s);
        li.innerHTML = `
          <span class="step-idx">${i + 1}</span>
          <span class="step-badge ${badge.cls}">${badge.label}</span>
          <span class="step-val"></span>
          <span class="step-actions">
            <button type="button" class="step-icon-btn" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="step-icon-btn" data-act="dn" aria-label="Move down" ${i === m.steps.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="step-icon-btn del" data-act="del" aria-label="Delete step">✕</button>
          </span>
        `;
        li.querySelector('.step-val').textContent = stepLabel(s);
        li.querySelector('[data-act="up"]').onclick = () => {
          [m.steps[i - 1], m.steps[i]] = [m.steps[i], m.steps[i - 1]];
          saveLibrary();
          renderAll();
        };
        li.querySelector('[data-act="dn"]').onclick = () => {
          [m.steps[i + 1], m.steps[i]] = [m.steps[i], m.steps[i + 1]];
          saveLibrary();
          renderAll();
        };
        li.querySelector('[data-act="del"]').onclick = () => {
          m.steps.splice(i, 1);
          saveLibrary();
          renderAll();
        };
        ol.appendChild(li);
      });
    }

    const payload = { version: 1, macros: [{ name: m.name || 'Macro', steps: m.steps }] };
    $('jsonPreview').textContent = JSON.stringify(payload, null, 2);
  }

  function renderBuilder() {
    const kind = $('stepKind').value;
    const box = $('builderInputs');
    box.innerHTML = '';
    if (kind === 'text') {
      const inp = document.createElement('input');
      inp.id = 'bText';
      inp.type = 'text';
      inp.className = 'input';
      inp.placeholder = 'ASCII text to type (e.g. top)';
      inp.style.flex = '1';
      box.appendChild(inp);
    } else if (kind === 'key') {
      const sel = document.createElement('select');
      sel.id = 'bKey';
      sel.className = 'select';
      KEY_OPTIONS.forEach((o, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
      box.appendChild(sel);
      [['Ctrl', MOD.CTRL], ['Shift', MOD.SHIFT], ['Alt', MOD.ALT], ['Win', MOD.GUI]].forEach(([lbl, bit]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm mod-btn' + (builderMods & bit ? ' active' : '');
        btn.textContent = lbl;
        btn.onclick = () => {
          builderMods ^= bit;
          btn.classList.toggle('active', Boolean(builderMods & bit));
        };
        box.appendChild(btn);
      });
    } else if (kind === 'wait') {
      const inp = document.createElement('input');
      inp.id = 'bWait';
      inp.type = 'number';
      inp.className = 'input';
      inp.value = '500';
      inp.min = '0';
      inp.max = '60000';
      inp.step = '100';
      inp.style.width = '110px';
      box.appendChild(inp);
    } else {
      const sel = document.createElement('select');
      sel.id = 'bMedia';
      sel.className = 'select';
      MEDIA_OPTIONS.forEach((o, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
      box.appendChild(sel);
    }
  }

  function pushStep(step) {
    current().steps.push(step);
    saveLibrary();
    renderAll();
  }

  // Physical keyboard recording
  let soloMods = 0;
  let otherKeyDuringMod = false;

  function modBitForKey(key) {
    if (key === 'Control') return MOD.CTRL;
    if (key === 'Shift') return MOD.SHIFT;
    if (key === 'Alt' || key === 'AltGraph') return MOD.ALT;
    if (key === 'Meta') return MOD.GUI;
    return 0;
  }

  function recordWaitIfNeeded() {
    const now = performance.now();
    if ($('chkRecWaits').checked && lastKeyTime > 0) {
      const delta = Math.round((now - lastKeyTime) / 50) * 50;
      if (delta >= 400 && delta <= 60000) {
        current().steps.push({ w: delta });
      }
    }
    lastKeyTime = now;
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    soloMods = 0;
    otherKeyDuringMod = false;
    $('btnRecLabel').textContent = 'Record from keyboard';
    $('btnRec').classList.remove('btn-rec-active');
    $('recBox').classList.remove('recording');
  }

  function toggleRecording() {
    if (recording) {
      stopRecording();
      setStatus('Recording stopped.');
      return;
    }
    recording = true;
    lastKeyTime = 0;
    soloMods = 0;
    otherKeyDuringMod = false;
    $('btnRecLabel').textContent = 'Stop recording';
    $('btnRec').classList.add('btn-rec-active');
    $('recBox').classList.add('recording');
    if (document.activeElement) document.activeElement.blur();
    setStatus('Recording active — type on your physical keyboard.');
  }

  window.addEventListener('keydown', (e) => {
    if (!recording || activeTab !== 'macros') return;
    e.preventDefault();
    e.stopPropagation();

    const modBit = modBitForKey(e.key);
    if (modBit) {
      if (!e.repeat) soloMods |= modBit;
      return;
    }

    otherKeyDuringMod = true;
    soloMods = 0;
    recordWaitIfNeeded();

    const hasCmdMod = e.ctrlKey || e.altKey || e.metaKey;
    if (!hasCmdMod && e.key.length === 1 && e.key.charCodeAt(0) >= 0x20 && e.key.charCodeAt(0) <= 0x7e) {
      const steps = current().steps;
      const prev = steps[steps.length - 1];
      if (prev && 's' in prev && prev.s.length < 120) {
        prev.s += e.key;
      } else {
        steps.push({ s: e.key });
      }
      saveLibrary();
      renderAll();
      return;
    }

    const hid = CODE_TO_HID[e.code];
    if (!hid) {
      setStatus(`Unmapped key (${e.code})`, true);
      return;
    }
    const m = (e.ctrlKey ? MOD.CTRL : 0)
      | (e.shiftKey ? MOD.SHIFT : 0)
      | (e.altKey ? MOD.ALT : 0)
      | (e.metaKey ? MOD.GUI : 0);
    pushStep(m ? { k: hid, m } : { k: hid });
  }, true);

  window.addEventListener('keyup', (e) => {
    if (!recording || activeTab !== 'macros') return;
    const modBit = modBitForKey(e.key);
    if (!modBit) return;
    e.preventDefault();
    e.stopPropagation();

    const anyStillHeld = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;
    if (!anyStillHeld) {
      if (!otherKeyDuringMod && soloMods !== 0) {
        recordWaitIfNeeded();
        pushStep({ k: 0, m: soloMods });
      }
      soloMods = 0;
      otherKeyDuringMod = false;
    }
  }, true);

  // Macro Studio UI actions
  $('btnRec').onclick = toggleRecording;
  $('macroName').oninput = (e) => {
    current().name = e.target.value;
    saveLibrary();
    renderList();
    $('editorTitle').textContent = current().name || 'Untitled macro';
    $('jsonPreview').textContent = JSON.stringify(
      { version: 1, macros: [{ name: current().name || 'Macro', steps: current().steps }] },
      null,
      2
    );
  };

  $('stepKind').onchange = () => {
    builderMods = 0;
    renderBuilder();
  };

  $('btnAddStep').onclick = () => {
    const kind = $('stepKind').value;
    if (kind === 'text') {
      const v = $('bText').value;
      if (!v) return;
      pushStep({ s: v });
      $('bText').value = '';
    } else if (kind === 'key') {
      const code = KEY_OPTIONS[Number($('bKey').value)].code;
      if (code === 0 && builderMods === 0) return;
      pushStep(builderMods ? { k: code, m: builderMods } : { k: code });
    } else if (kind === 'wait') {
      const w = Math.max(0, Math.min(60000, Number($('bWait').value) || 0));
      pushStep({ w });
    } else {
      pushStep({ c: MEDIA_OPTIONS[Number($('bMedia').value)].code });
    }
  };

  $('btnClearSteps').onclick = () => {
    current().steps = [];
    saveLibrary();
    renderAll();
  };

  $('btnNew').onclick = () => {
    stopRecording();
    macros.push({ name: `New macro ${macros.length + 1}`, steps: [] });
    activeIdx = macros.length - 1;
    saveLibrary();
    renderAll();
  };

  $('btnDeleteMacro').onclick = () => {
    if (macros.length <= 1) return;
    stopRecording();
    macros.splice(activeIdx, 1);
    activeIdx = Math.max(0, activeIdx - 1);
    saveLibrary();
    renderAll();
  };

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  $('btnExportOne').onclick = () => {
    const m = current();
    if (m.steps.length === 0) {
      setStatus('Add at least one step before exporting.', true);
      return;
    }
    const slug = (m.name || 'macro')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'macro';
    downloadJson({ version: 1, macros: [{ name: m.name || 'Macro', steps: m.steps }] }, `mk-macro-${slug}.json`);
    setStatus('JSON file downloaded — import it in the Macros tab of the Remote app.');
  };

  $('btnExportAll').onclick = () => {
    const valid = macros.filter((m) => m.steps.length > 0);
    if (valid.length === 0) {
      setStatus('No macros with steps to export.', true);
      return;
    }
    downloadJson({ version: 1, macros: valid.map(({ name, steps }) => ({ name, steps })) }, 'pocket-hid-macros.json');
    setStatus(`Exported ${valid.length} macro(s) to pocket-hid-macros.json.`);
  };

  $('btnCopyJson').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('jsonPreview').textContent);
      setStatus('JSON copied to clipboard.');
    } catch {
      setStatus('Unable to copy automatically.', true);
    }
  };

  $('btnImport').onclick = () => $('fileInput').click();
  $('fileInput').onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed?.macros) ? parsed.macros : Array.isArray(parsed) ? parsed : [parsed];
      let added = 0;
      for (const item of list) {
        if (item && Array.isArray(item.steps) && item.steps.length > 0) {
          macros.push({ name: String(item.name || item.id || 'Imported macro').slice(0, 60), steps: item.steps });
          added++;
        }
      }
      if (added === 0) {
        setStatus('No valid macros found.', true);
        return;
      }
      activeIdx = macros.length - 1;
      saveLibrary();
      renderAll();
      setStatus(`Imported ${added} macro(s) into library.`);
    } catch {
      setStatus('Invalid JSON file.', true);
    }
  };

  $('btnBlePush').onclick = async () => {
    if (!navigator.bluetooth) {
      setStatus('Web Bluetooth is not supported in this browser (use Chrome/Edge or export JSON).', true);
      return;
    }
    const m = current();
    if (m.steps.length === 0 || m.steps.length > 64) {
      setStatus(`ESP requires between 1 and 64 steps (current: ${m.steps.length}).`, true);
      return;
    }
    const espId = (m.name || 'macro')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'macro';
    const blob = JSON.stringify(m.steps);
    if (blob.length > 2048) {
      setStatus(`Macro too large for ESP NVS (${blob.length}/2048 bytes).`, true);
      return;
    }
    try {
      setStatus('Select PocketHID in the Bluetooth picker…');
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [BLE_SVC] }] });
      const server = await dev.gatt.connect();
      const svc = await server.getPrimaryService(BLE_SVC);
      const rx = await svc.getCharacteristic(BLE_RX);
      const enc = new TextEncoder();
      const writeMsg = async (obj) => {
        const bytes = enc.encode(JSON.stringify(obj) + '\n');
        for (let off = 0; off < bytes.length; off += 180) {
          await rx.writeValueWithoutResponse(bytes.slice(off, off + 180));
        }
      };
      await writeMsg({ t: 'hello', v: 1 });
      await new Promise((r) => setTimeout(r, 150));
      await writeMsg({ t: 'macro_save', id: espId, steps: m.steps });
      await new Promise((r) => setTimeout(r, 150));
      server.disconnect();
      setStatus(`Macro sent to ESP32 as "${espId}".`);
    } catch (err) {
      setStatus('BLE push cancelled or failed: ' + (err?.message || err), true);
    }
  };

  // Populate quick steps and presets
  QUICK_STEPS.forEach((q) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keycap';
    btn.textContent = q.label;
    btn.onclick = () => pushStep({ ...q.step });
    $('quickSteps').appendChild(btn);
  });

  PRESETS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.textContent = p.name;
    btn.onclick = () => {
      stopRecording();
      macros.push({ name: p.name, steps: p.steps.map((s) => ({ ...s })) });
      activeIdx = macros.length - 1;
      saveLibrary();
      renderAll();
      setStatus(`Preset "${p.name}" added.`);
    };
    $('presetList').appendChild(btn);
  });

  renderBuilder();
  renderAll();
  switchTab(tabFromHash(), false);
})();
