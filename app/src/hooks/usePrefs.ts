import { useCallback, useEffect, useState } from 'react';

export interface Prefs {
  sensitivity: number;
  scrollSpeed: number;
  naturalScroll: boolean;
  haptics: boolean;
  wakeLock: boolean;
  transliterate: boolean;
}

const PREFS_KEY = 'mk.prefs.v1';

const DEFAULT_PREFS: Prefs = {
  sensitivity: 1.6,
  scrollSpeed: 1.0,
  naturalScroll: true,
  haptics: true,
  wakeLock: true,
  transliterate: true,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      sensitivity: clampNum(parsed.sensitivity, 0.5, 3.0, DEFAULT_PREFS.sensitivity),
      scrollSpeed: clampNum(parsed.scrollSpeed, 0.5, 2.5, DEFAULT_PREFS.scrollSpeed),
      naturalScroll: typeof parsed.naturalScroll === 'boolean' ? parsed.naturalScroll : DEFAULT_PREFS.naturalScroll,
      haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : DEFAULT_PREFS.haptics,
      wakeLock: typeof parsed.wakeLock === 'boolean' ? parsed.wakeLock : DEFAULT_PREFS.wakeLock,
      transliterate: typeof parsed.transliterate === 'boolean' ? parsed.transliterate : DEFAULT_PREFS.transliterate,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  const updatePref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable
      }
      return next;
    });
  }, []);

  const vibrate = useCallback(
    (pattern: number | number[] = 10) => {
      if (!prefs.haptics) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        // unsupported (e.g. iOS Safari)
      }
    },
    [prefs.haptics]
  );

  return { prefs, updatePref, vibrate };
}

// Keep screen awake while the app is active and connected
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // ignored (low battery or browser permissions)
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}

// Map common characters (Italian accents, typographic quotes, dashes) to ASCII
// when the target uses a US/ASCII keymap.
const CHAR_MAP: Record<string, string> = {
  à: "a'", è: "e'", é: "e'", ì: "i'", ò: "o'", ù: "u'",
  À: "A'", È: "E'", É: "E'", Ì: "I'", Ò: "O'", Ù: "U'",
  á: 'a', í: 'i', ó: 'o', ú: 'u', ä: 'a', ö: 'o', ü: 'u', ç: 'c', ñ: 'n',
  Á: 'A', Í: 'I', Ó: 'O', Ú: 'U', Ä: 'A', Ö: 'O', Ü: 'U', Ç: 'C', Ñ: 'N',
  '‘': "'", '’': "'", '“': '"', '”': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '…': '...', '€': 'EUR', '°': ' deg',
};

export function transliterateAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0x7e) {
      out += ch;
    } else if (CHAR_MAP[ch]) {
      out += CHAR_MAP[ch];
    }
    // other characters (e.g. emoji) are skipped
  }
  return out;
}

export function countNonAscii(s: string): number {
  let n = 0;
  for (const ch of s) if (ch.codePointAt(0)! > 0x7e) n++;
  return n;
}
