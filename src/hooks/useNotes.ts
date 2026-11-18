import { useEffect, useState } from 'react';

export interface Note {
  guess: string;
  text: string;
}
export type Notes = Record<string, Note>;

/** Private per-device scratchpad of suspicions, kept per room and round. */
export function useNotes(roomId: string, round: number) {
  const key = `secret-number-notes-${roomId}-${round}`;
  const [notes, setNotes] = useState<Notes>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}') as Notes;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(notes));
    } catch {
      /* ignore */
    }
  }, [key, notes]);
  const update = (id: string, patch: Partial<Note>) =>
    setNotes((n) => ({ ...n, [id]: { ...({ guess: '', text: '' } as Note), ...n[id], ...patch } }));
  return { notes, update };
}
