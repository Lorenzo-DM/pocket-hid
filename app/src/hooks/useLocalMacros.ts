import { useCallback, useState } from 'react';
import type { MacroStep } from '../protocol/messages';

export interface LocalMacro {
  id: string;
  name: string;
  steps: MacroStep[];
}

const STORAGE_KEY = 'mk.macros.v1';

export function sanitizeSteps(raw: unknown): MacroStep[] {
  if (!Array.isArray(raw)) return [];
  const out: MacroStep[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.k === 'number' && Number.isFinite(o.k)) {
      const code = Math.max(0, Math.min(255, Math.trunc(o.k)));
      const mods = typeof o.m === 'number' && Number.isFinite(o.m) ? Math.trunc(o.m) & 0x0f : 0;
      if (code === 0 && mods === 0) continue;
      out.push(mods ? { k: code, m: mods } : { k: code });
    } else if (typeof o.s === 'string' && o.s.length > 0) {
      out.push({ s: o.s });
    } else if (typeof o.c === 'number' && Number.isFinite(o.c) && o.c > 0) {
      out.push({ c: Math.trunc(o.c) & 0xffff });
    } else if (typeof o.w === 'number' && Number.isFinite(o.w)) {
      out.push({ w: Math.max(0, Math.min(60000, Math.trunc(o.w))) });
    }
  }
  return out;
}

function makeId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Converte un nome libero in un ID valido per l'NVS dell'ESP ([a-zA-Z0-9_-]{1,20}). */
export function toEspMacroId(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  if (!cleaned || cleaned === '__idx') return 'macro';
  return cleaned;
}

export function validateForEsp(name: string, steps: MacroStep[]): { ok: true; espId: string } | { ok: false; reason: string } {
  const espId = toEspMacroId(name);
  if (steps.length === 0) return { ok: false, reason: 'La macro non ha step.' };
  if (steps.length > 64) return { ok: false, reason: `Troppi step per l'ESP (${steps.length}/64).` };
  const blob = JSON.stringify(steps);
  if (blob.length > 2048) return { ok: false, reason: `Macro troppo grande per l'ESP (${blob.length}/2048 byte).` };
  return { ok: true, espId };
}

export function parseMacrosJson(rawText: string): { name: string; steps: MacroStep[] }[] {
  const parsed: unknown = JSON.parse(rawText);
  if (!parsed) return [];

  // Formato 1: { macros: [...] }
  if (typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as Record<string, unknown>).macros)) {
    return extractMacroList((parsed as Record<string, unknown>).macros as unknown[]);
  }

  // Formato 2: array di macro [{ name, steps }] oppure array diretto di step [{ k/s/c/w }]
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && isLikelyStep(parsed[0])) {
      const steps = sanitizeSteps(parsed);
      return steps.length > 0 ? [{ name: 'Macro importata', steps }] : [];
    }
    return extractMacroList(parsed);
  }

  // Formato 3: singola macro { name?, id?, steps }
  if (typeof parsed === 'object') {
    return extractMacroList([parsed]);
  }

  return [];
}

function isLikelyStep(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return 'k' in o || 's' in o || 'c' in o || 'w' in o;
}

function extractMacroList(items: unknown[]): { name: string; steps: MacroStep[] }[] {
  const out: { name: string; steps: MacroStep[] }[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const steps = sanitizeSteps(o.steps);
    if (steps.length === 0) continue;
    const rawName = typeof o.name === 'string' && o.name.trim()
      ? o.name.trim()
      : typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : `Macro ${out.length + 1}`;
    out.push({ name: rawName.slice(0, 60), steps });
  }
  return out;
}

export function exportMacrosJson(macros: LocalMacro[]): string {
  return JSON.stringify(
    {
      version: 1,
      macros: macros.map(({ name, steps }) => ({ name, steps })),
    },
    null,
    2
  );
}

function loadMacros(): LocalMacro[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: LocalMacro[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const steps = sanitizeSteps(o.steps);
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      if (!name || steps.length === 0) continue;
      const id = typeof o.id === 'string' && o.id ? o.id : makeId();
      out.push({ id, name, steps });
    }
    return out;
  } catch {
    return [];
  }
}

function persistMacros(list: LocalMacro[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage pieno o non disponibile
  }
}

export function useLocalMacros() {
  const [macros, setMacros] = useState<LocalMacro[]>(loadMacros);

  const upsertMacro = useCallback((entry: { id?: string; name: string; steps: MacroStep[] }): LocalMacro => {
    const name = entry.name.trim().slice(0, 60);
    const id = entry.id || makeId();
    const saved: LocalMacro = { id, name, steps: entry.steps };
    setMacros((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      const next = idx >= 0
        ? prev.map((m, i) => (i === idx ? saved : m))
        : [...prev, saved];
      persistMacros(next);
      return next;
    });
    return saved;
  }, []);

  const deleteMacro = useCallback((id: string) => {
    setMacros((prev) => {
      const next = prev.filter((m) => m.id !== id);
      persistMacros(next);
      return next;
    });
  }, []);

  const importMacros = useCallback((incoming: { name: string; steps: MacroStep[] }[]): number => {
    if (incoming.length === 0) return 0;
    setMacros((prev) => {
      const next = [...prev];
      for (const item of incoming) {
        const existingIdx = next.findIndex((m) => m.name.toLowerCase() === item.name.toLowerCase());
        if (existingIdx >= 0) {
          next[existingIdx] = { ...next[existingIdx], name: item.name, steps: item.steps };
        } else {
          next.push({ id: makeId(), name: item.name, steps: item.steps });
        }
      }
      persistMacros(next);
      return next;
    });
    return incoming.length;
  }, []);

  return { macros, upsertMacro, deleteMacro, importMacros };
}
