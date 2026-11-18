import { useEffect, useState } from 'react';

export interface Note {
  guess: string;
  text: string;
}
export type Notes = Record<string, Note>;
export type Mark = 'x' | 'likely';
export type Grid = Record<number, Mark>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Private per-device scratchpad, kept per room and round: per-player notes and a grid for your own number. */
export function useNotes(roomId: string, round: number) {
  const key = `secret-number-notes-${roomId}-${round}`;
  const [notes, setNotes] = useState<Notes>(() => read(key, {}));
  const [grid, setGrid] = useState<Grid>(() => read(`${key}-grid`, {}));
  useEffect(() => write(key, notes), [key, notes]);
  useEffect(() => write(`${key}-grid`, grid), [key, grid]);

  const update = (id: string, patch: Partial<Note>) =>
    setNotes((n) => ({ ...n, [id]: { ...({ guess: '', text: '' } as Note), ...n[id], ...patch } }));
  const cycle = (n: number) =>
    setGrid((g) => {
      const next = { ...g };
      if (!g[n]) next[n] = 'x';
      else if (g[n] === 'x') next[n] = 'likely';
      else delete next[n];
      return next;
    });
  const resetGrid = () => setGrid({});
  return { notes, update, grid, cycle, resetGrid };
}
export type NotesStore = ReturnType<typeof useNotes>;
