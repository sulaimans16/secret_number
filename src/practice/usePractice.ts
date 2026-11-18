import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameActions, GameView } from '../lib/engine';
import {
  createPractice,
  finalize,
  share,
  startGuessing,
  startInvestigation,
  step,
  submitYourGuesses,
  visit,
  YOU,
  yourClues,
  yourMessages,
  type PracticeSettings,
  type PracticeState,
} from './engine';

const KEY = 'secret-number-practice';

export function loadPractice(): PracticeState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PracticeState) : null;
  } catch {
    return null;
  }
}
export function clearPractice() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function usePractice(initial: PracticeState, onExit: () => void, onSettings: () => void) {
  const [state, setState] = useState<PracticeState>(initial);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  // the game clock: bots act and phases advance
  useEffect(() => {
    const t = window.setInterval(() => setState((s) => step(s)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const apply = useCallback(<T,>(fn: (s: PracticeState) => { state: PracticeState; value: T }) => {
    const out = fn(ref.current); // throws synchronously on invalid moves
    ref.current = out.state;
    setState(out.state);
    return out.value;
  }, []);

  const actions: GameActions = useMemo(
    () => ({
      useTicket: async (target, ticket) =>
        apply((s) => {
          const { state: n, result } = visit(s, YOU, target, ticket);
          return { state: n, value: { result } };
        }),
      submitGuesses: async (g) => apply((s) => ({ state: submitYourGuesses(s, g), value: undefined })),
      ready: async () => apply((s) => ({ state: startInvestigation(s), value: undefined })),
      forceAdvance: async () =>
        apply((s) => ({
          state: s.room.status === 'briefing' ? startInvestigation(s) : s.room.status === 'investigation' ? startGuessing(s) : finalize(s),
          value: undefined,
        })),
      rematch: async () => apply((s) => ({ state: createPractice(s.settings, s.room.round + 1), value: undefined })),
      leave: () => {
        clearPractice();
        onExit();
      },
      revealGuesses: async () =>
        ref.current.guesses.map((g) => ({ player_id: g.player, target_player: g.target, value: g.value })),
      ask: async (bot) => {
        apply((s) => ({ state: share(s, bot, Math.random, YOU), value: undefined }));
      },
      changeSettings: () => {
        clearPractice();
        onSettings();
      },
    }),
    [apply, onExit, onSettings],
  );

  const view: GameView = {
    kind: 'practice',
    room: state.room,
    players: state.players,
    visits: state.visits,
    clues: yourClues(state),
    me: state.players[0],
    isHost: true,
    messages: state.room.status === 'reveal' ? state.messages.filter((m) => !m.to || m.to === YOU) : yourMessages(state).map(stripLie),
    difficulty: state.settings.difficulty,
  };
  return { view, actions, state };
}

export const newPractice = (s: PracticeSettings) => createPractice(s);

// Keep the "lie" flag out of the UI until the reveal.
const stripLie = <M extends { claim?: { lie: boolean } }>(m: M): M => (m.claim ? { ...m, claim: { ...m.claim, lie: false } } : m);
