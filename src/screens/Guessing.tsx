import { useState } from 'react';
import type { GameActions, GameView } from '../lib/engine';
import { MODES, TICKETS } from '../lib/rules';
import { fmtClock, useCountdown } from '../hooks/useRoom';
import { useNotes } from '../hooks/useNotes';
import { Avatar, ErrorLine, Modal, Screen } from '../components/ui';
import { NotesPanel } from '../components/NotesPanel';

export function Guessing({ view, actions }: { view: GameView; actions: GameActions }) {
  const { room, players, clues, me } = view;
  const left = useCountdown(room.phase_ends_at, actions.tick);
  const notes = useNotes(room.id, room.round);
  const max = MODES[room.mode].maxNumber;
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init = Object.fromEntries(players.map((p) => [p.id, notes.notes[p.id]?.guess ?? '']));
    const open = Array.from({ length: max }, (_, i) => i + 1).filter((n) => notes.grid[n] !== 'x');
    if (!init[me.id] && open.length === 1) init[me.id] = String(open[0]);
    return init;
  });
  const [showNotes, setShowNotes] = useState(false);
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
      await actions.submitGuesses(out);
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
        <button className="link" onClick={() => setShowNotes(true)}>
          My notes
        </button>
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
      {showNotes && (
        <Modal label="My notes" onClose={() => setShowNotes(false)}>
          <h2 className="title title--sm">My notes</h2>
          <NotesPanel store={notes} players={players} me={me} max={max} />
        </Modal>
      )}
    </Screen>
  );
}
