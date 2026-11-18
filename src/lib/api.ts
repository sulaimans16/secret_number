import { createClient } from '@supabase/supabase-js';
import type { Mode, Ticket } from './rules';

// The publishable key is safe to ship to browsers: every table holding secrets
// is locked by RLS and all game actions run through server-side functions.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jrrwhsxywnavxwuejjtr.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_IPq-E62s_qGep_zeEv91zw_kCk6WWUC';

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 20 } },
});

export type Status = 'lobby' | 'briefing' | 'investigation' | 'guessing' | 'reveal';

export interface Room {
  id: string;
  code: string;
  host_player: string;
  mode: Mode;
  max_players: number;
  invest_minutes: number;
  status: Status;
  phase_ends_at: string | null;
  round: number;
}

export interface Player {
  id: string;
  room_id: string;
  name: string;
  seat: number;
  tickets: Record<string, number>;
  ready: boolean;
  guessed: boolean;
  score: number;
  own_points: number;
  guess_points: number;
  secret_bonus: number;
  revealed_number: number | null;
}

export interface Visit {
  id: number;
  room_id: string;
  from_player: string;
  to_player: string;
  ticket: Ticket;
  created_at: string;
}

export interface Clue {
  visit_id: number;
  from_player: string;
  to_player: string;
  ticket: Ticket;
  result: string;
  created_at: string;
}

export interface Session {
  room_id: string;
  code: string;
  player_id: string;
  token: string;
}

const SESSION_KEY = 'secret-number-session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — session lives in memory only */
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, '') || 'Something went wrong');
  return data as T;
}

const auth = (s: Session) => ({ p_player: s.player_id, p_token: s.token });

export const api = {
  createRoom: (name: string, mode: Mode, max: number, minutes: number) =>
    rpc<Session>('create_room', { p_name: name, p_mode: mode, p_max: max, p_minutes: minutes }),
  joinRoom: (code: string, name: string) => rpc<Session>('join_room', { p_code: code, p_name: name }),
  leave: (s: Session) => rpc<void>('leave_room', auth(s)),
  updateSettings: (s: Session, mode: Mode, max: number, minutes: number) =>
    rpc<void>('update_settings', { ...auth(s), p_mode: mode, p_max: max, p_minutes: minutes }),
  start: (s: Session) => rpc<void>('start_game', auth(s)),
  ready: (s: Session) => rpc<void>('set_ready', auth(s)),
  useTicket: (s: Session, target: string, ticket: Ticket) =>
    rpc<{ visit_id: number; result: string }>('use_ticket', { ...auth(s), p_target: target, p_ticket: ticket }),
  myClues: (s: Session) => rpc<Clue[]>('my_clues', auth(s)),
  submitGuesses: (s: Session, guesses: Record<string, number>) =>
    rpc<void>('submit_guesses', { ...auth(s), p_guesses: guesses }),
  tick: (roomId: string) => rpc<void>('tick', { p_room: roomId }),
  forceAdvance: (s: Session) => rpc<void>('force_advance', auth(s)),
  revealGuesses: (roomId: string) =>
    rpc<{ player_id: string; target_player: string; value: number }[]>('reveal_guesses', { p_room: roomId }),
  rematch: (s: Session) => rpc<void>('rematch', auth(s)),
};
