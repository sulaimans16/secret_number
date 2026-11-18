import { useMemo } from 'react';
import type { GameView } from '../lib/engine';
import { TICKETS } from '../lib/rules';
import { candidates } from '../practice/solver';
import { fmtPossible } from './NotesPanel';

/** Practice debrief: your clues, what they proved, and who lied in chat. */
export function Solution({ view }: { view: GameView }) {
  const { players, clues, me, room } = view;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const proven = useMemo(
    () =>
      candidates(
        clues.map((c) => ({ a: c.from_player, b: c.to_player, ticket: c.ticket, result: c.result })),
        players.map((p) => p.id),
        room.mode,
      ),
    [clues, players, room.mode],
  );
  const claims = (view.messages ?? []).filter((m) => m.claim);
  const lies = claims.filter((m) => m.claim!.lie);
  const ownSolved = proven[me.id].length === 1;

  return (
    <div className="solution">
      <h3>What your clues proved</h3>
      <p className="muted small">
        {ownSolved
          ? `Your clues alone pinned your number to ${proven[me.id][0]}.`
          : `Your clues left ${proven[me.id].length} possibilities for your own number. More visits, or trading clues, would have narrowed it.`}
      </p>
      <ul className="solution__list">
        {players.map((p) => (
          <li key={p.id}>
            <span>{p.id === me.id ? 'You' : p.name}</span>
            <span className="muted small">{fmtPossible(proven[p.id])}</span>
            <b className="gold">{p.revealed_number}</b>
          </li>
        ))}
      </ul>

      <h3>Your clues</h3>
      {clues.length === 0 && <p className="muted small">You had no clues. Visit players to gather information.</p>}
      <ul className="solution__list">
        {clues.map((c) => {
          const a = byId[c.from_player];
          const b = byId[c.to_player];
          return (
            <li key={c.visit_id}>
              <span>
                {a?.name} ({a?.revealed_number}) {TICKETS[c.ticket].symbol} {b?.name} ({b?.revealed_number})
              </span>
              <b className="gold">= {c.result}</b>
            </li>
          );
        })}
      </ul>

      <h3>Chat claims</h3>
      {claims.length === 0 ? (
        <p className="muted small">Nobody shared anything.</p>
      ) : (
        <p className="muted small">
          {lies.length === 0 ? `All ${claims.length} claims were true.` : `${lies.length} of ${claims.length} claims were lies:`}
        </p>
      )}
      <ul className="solution__list">
        {lies.map((m) => (
          <li key={m.id} className="is-lie">
            <span>
              {byId[m.from]?.name}: “{m.text}”
            </span>
            <b className="neg">LIE</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
