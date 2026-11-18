import { useState } from 'react';
import { api, type Clue, type Player, type Room, type Session } from '../lib/api';
import { MODES, TICKETS } from '../lib/rules';
import { fmtClock, useCountdown } from '../hooks/useRoom';
import { useNotes } from '../hooks/useNotes';
import { Avatar, ErrorLine, Screen } from '../components/ui';

interface Props {
  session: Session;
  room: Room;
  players: Player[];
  clues: Clue[];
  me: Player;
}

export function Guessing({ session, room, players, clues, me }: Props) {
  const left = useCountdown(room.phase_ends_at, room.id);
  const { notes } = useNotes(room.id, room.round);
  const max = MODES[room.mode].maxNumber;
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, notes[p.id]?.guess ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const order = [me, ...players.filter((p) => p.id !== me.id)];
  const waiting = players.filter((p) => !p.guessed);

  async function submit() {
    setError(null);
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(vals)) {
      if (!v) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > max) return setError(`Guesses must be between 1 and ${max}.`);
      out[id] = n;
    }
    setBusy(true);
    try {
      await api.submitGuesses(session, out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (me.guessed) {
    return (
      <Screen className="center-screen">
        <span className="eyebrow">Answers sealed</span>
        <h1 className="title">Waiting for the others</h1>
        <div className="clock clock--small">{fmtClock(left)}</div>
        <ul className="ready-list">
          {players.map((p) => (
            <li key={p.id} className={p.guessed ? 'is-ready' : ''}>
              <Avatar name={p.name} seat={p.seat} />
              <span>{p.name}</span>
              <b>{p.guessed ? 'SEALED' : 'writing…'}</b>
            </li>
          ))}
        </ul>
        <p className="muted small">{waiting.length} still writing</p>
      </Screen>
    );
  }

  return (
    <Screen className={`screen--scroll game ${left <= 30 ? 'is-urgent' : ''}`}>
      <header className="hud">
        <div>
          <span className="eyebrow">Final answers</span>
          <div className={`clock ${left <= 30 ? 'clock--urgent' : ''}`}>{fmtClock(left)}</div>
        </div>
      </header>
      <p className="muted">
        Leave a box blank to skip it. A wrong guess for your own number costs <b>5 points</b>, and a skip costs nothing.
      </p>
      <ul className="guess-list">
        {order.map((p) => {
          const own = p.id === me.id;
          const related = clues.filter((c) => !own && (c.from_player === p.id || c.to_player === p.id));
          return (
            <li key={p.id} className={`guess ${own ? 'guess--own' : ''}`}>
              <Avatar name={p.name} seat={p.seat} />
              <div className="guess__body">
                <b>{own ? 'Your own number' : p.name}</b>
                <span className="small muted">
                  {own
                    ? '+5 if right · −5 if wrong'
                    : related.length
                      ? related.map((c) => `${TICKETS[c.ticket].symbol}${c.result}`).join('  ')
                      : '+2 if right'}
                </span>
              </div>
              <input
                className="guess__input"
                inputMode="numeric"
                placeholder="—"
                aria-label={own ? 'Your own number' : `${p.name}'s number`}
                value={vals[p.id] ?? ''}
                onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
              />
            </li>
          );
        })}
      </ul>
      <ErrorLine error={error} />
      <div className="dock">
        <button className="btn btn--primary btn--block" disabled={busy} onClick={submit}>
          Seal my answers
        </button>
      </div>
    </Screen>
  );
}
