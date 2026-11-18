import { useEffect, useMemo, useState } from 'react';
import type { GameActions, GameView } from '../lib/engine';
import { Avatar, ErrorLine, Screen, Typewriter } from '../components/ui';
import { Solution } from '../components/Solution';

export function Reveal({ view, actions }: { view: GameView; actions: GameActions }) {
  const { room, players, me, isHost } = view;
  const practice = view.kind === 'practice';
  const [showSolution, setShowSolution] = useState(false);
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduce ? players.length : 0);
  const [guesses, setGuesses] = useState<{ player_id: string; target_player: string; value: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    actions.revealGuesses().then(setGuesses).catch(() => {});
  }, [actions, room.id]);

  useEffect(() => {
    if (shown >= players.length) return;
    const t = window.setTimeout(() => setShown((s) => s + 1), shown === 0 ? 1600 : 1100);
    return () => window.clearTimeout(t);
  }, [shown, players.length]);

  const ranked = useMemo(() => [...players].sort((a, b) => b.score - a.score || a.seat - b.seat), [players]);
  const lowest = ranked.length ? ranked[ranked.length - 1].score : 0;
  const done = shown >= players.length;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const crackedBy = (id: string) =>
    guesses.filter((g) => g.target_player === id && g.player_id !== id && g.value === byId[id]?.revealed_number);

  return (
    <Screen className="screen--scroll">
      <div className="announce">
        <span className="eyebrow">The numbers</span>
        <h1 className="title title--xl">
          <Typewriter text={done ? 'The game is over.' : 'Opening the seals…'} />
        </h1>
      </div>

      <ul className="unseal">
        {[...players]
          .sort((a, b) => a.seat - b.seat)
          .map((p, i) => {
            const open = i < shown;
            const own = guesses.find((g) => g.player_id === p.id && g.target_player === p.id);
            return (
              <li key={p.id} className={`unseal__row ${open ? 'is-open' : ''}`}>
                <Avatar name={p.name} seat={p.seat} />
                <span className="unseal__name">
                  <span>
                    {p.name}
                    {p.id === me.id && <em> (you)</em>}
                  </span>
                  {open && (
                    <span className="small muted">
                      {own ? `guessed ${own.value} for themselves` : 'did not guess their own number'}
                      {crackedBy(p.id).length > 0 &&
                        ` · cracked by ${crackedBy(p.id)
                          .map((g) => byId[g.player_id]?.name)
                          .join(', ')}`}
                    </span>
                  )}
                </span>
                <span className="unseal__num">{open ? p.revealed_number : '??'}</span>
              </li>
            );
          })}
      </ul>

      {done && (
        <section className="panel board">
          <div className="panel__head">
            <h2>Standings</h2>
          </div>
          <ol className="board__list">
            {ranked.map((p, i) => {
              const out = p.score === lowest && ranked.length > 1 && ranked[0].score !== lowest;
              return (
                <li key={p.id} className={`board__row ${i === 0 ? 'is-first' : ''} ${out ? 'is-out' : ''}`}>
                  <span className="board__rank">{i + 1}</span>
                  <span className="board__name">
                    <span>
                      {p.name}
                      {out && <span className="stamp">ELIMINATED</span>}
                    </span>
                    <span className="small muted">
                      own {fmt(p.own_points)} · cracked {fmt(p.guess_points)} · secret {fmt(p.secret_bonus)}
                    </span>
                  </span>
                  <span className="board__score">{fmt(p.score)}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {done && practice && (
        <section className="panel">
          <button className="btn btn--block" onClick={() => setShowSolution((x) => !x)} aria-expanded={showSolution}>
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
          {showSolution && <Solution view={view} />}
        </section>
      )}

      <ErrorLine error={error} />
      {done && (
        <div className="dock">
          {isHost ? (
            <button className="btn btn--primary btn--block" onClick={() => actions.rematch().catch((e: Error) => setError(e.message))}>
              {practice ? 'Play again' : 'Play again with this group'}
            </button>
          ) : (
            <p className="waiting">The host can start another round.</p>
          )}
          {practice && (
            <button className="btn btn--block" onClick={() => actions.changeSettings?.()}>
              Change settings
            </button>
          )}
          <button className="link center" onClick={() => actions.leave()}>
            Leave
          </button>
        </div>
      )}
    </Screen>
  );
}

const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));
