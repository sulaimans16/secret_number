import { useCallback, useEffect, useRef, useState } from 'react';
import { api, supabase, type Clue, type Player, type Room, type Session, type Visit } from '../lib/api';

export interface RoomState {
  room: Room | null;
  players: Player[];
  visits: Visit[];
  clues: Clue[];
  me: Player | null;
  gone: boolean; // room deleted or we were removed
  refresh: () => Promise<void>;
}

export function useRoom(session: Session | null): RoomState {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clues, setClues] = useState<Clue[]>([]);
  const [gone, setGone] = useState(false);
  const pending = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    const rid = session.room_id;
    const [r, p, v] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', rid).maybeSingle(),
      supabase.from('players').select('*').eq('room_id', rid).order('seat'),
      supabase.from('visits').select('*').eq('room_id', rid).order('id'),
    ]);
    if (!r.error && !r.data) {
      setGone(true);
      return;
    }
    if (r.data) setRoom(r.data as Room);
    if (p.data) {
      setPlayers(p.data as Player[]);
      if (!p.data.some((x) => x.id === session.player_id)) setGone(true);
    }
    if (v.data) setVisits(v.data as Visit[]);
    try {
      setClues(await api.myClues(session));
    } catch {
      /* not authorised yet / removed */
    }
  }, [session]);

  // coalesce bursts of realtime events into one refetch
  const schedule = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void refresh(), 120);
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    setGone(false);
    void refresh();
    const rid = session.room_id;
    const ch = supabase
      .channel(`room-${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${rid}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${rid}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `room_id=eq.${rid}` }, schedule)
      .subscribe();
    // safety net in case a realtime event is missed (mobile sleep, flaky network)
    const poll = window.setInterval(() => void refresh(), 6000);
    const onVis = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      void supabase.removeChannel(ch);
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session, refresh, schedule]);

  const me = players.find((p) => p.id === session?.player_id) ?? null;
  return { room, players, visits, clues, me, gone, refresh };
}

/** Seconds left until `endsAt`; calls `onExpire` repeatedly once the deadline passes. */
export function useCountdown(endsAt: string | null, onExpire?: () => void) {
  const [now, setNow] = useState(Date.now());
  const cb = useRef(onExpire);
  cb.current = onExpire;
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000)) : 0;
  const expired = !!endsAt && left === 0;
  useEffect(() => {
    if (!expired || !cb.current) return;
    cb.current();
    const t = window.setInterval(() => cb.current?.(), 2500);
    return () => window.clearInterval(t);
  }, [expired]);
  return left;
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
