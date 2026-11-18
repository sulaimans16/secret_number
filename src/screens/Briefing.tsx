import { useState } from 'react';
import type { GameActions, GameView } from '../lib/engine';
import { MODES } from '../lib/rules';
import { Avatar, ErrorLine, Screen, Typewriter } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';

const DIFFICULTY_LINE = {
  easy: 'Easy bots wander, guess wildly and rarely talk.',
  medium: 'Medium bots pick their visits carefully and share honest clues.',
  hard: 'Hard bots play sharp, ignore claims that don’t add up, and sometimes lie to you.',
};

export function Briefing({ view, actions }: { view: GameView; actions: GameActions }) {
  const { room, players, me, isHost } = view;
  const [error, setError] = useState<string | null>(null);
  const readyCount = players.filter((p) => p.ready).length;
  const practice = view.kind === 'practice';

  const act = (fn: () => Promise<unknown>) => fn().catch((e: Error) => setError(e.message));

  return (
    <Screen className="screen--scroll briefing">
      <div className="announce">
        <span className="eyebrow">
          {practice ? `Practice · ${view.difficulty}` : 'Main match'} · {MODES[room.mode].title}
        </span>
        <h1 className="title title--xl">
          <Typewriter text="Your numbers have been sealed." />
        </h1>
        <p className="muted">
          {practice && view.difficulty
            ? DIFFICULTY_LINE[view.difficulty]
            : 'Read the rules. When everyone is ready, the clock starts.'}
        </p>
      </div>

      <RulesOverview mode={room.mode} minutes={room.invest_minutes} />

      <section className="panel">
        <div className="panel__head">
          <h2>{practice ? 'Opponents' : 'Ready'}</h2>
          <span className="pill">
            {readyCount} / {players.length}
          </span>
        </div>
        <ul className="ready-list">
          {players.map((p) => (
            <li key={p.id} className={p.ready ? 'is-ready' : ''}>
              <Avatar name={p.name} seat={p.seat} />
              <span>
                {p.name}
                {practice && p.id !== me.id && <em className="muted"> · bot</em>}
              </span>
              <b>{p.ready ? 'READY' : '…'}</b>
            </li>
          ))}
        </ul>
      </section>

      <ErrorLine error={error} />
      <div className="dock">
        <button className="btn btn--primary btn--block" disabled={me.ready} onClick={() => act(() => actions.ready())}>
          {me.ready ? 'Waiting for the others…' : 'I understand. Begin.'}
        </button>
        {isHost && !practice && (
          <button className="link center" onClick={() => act(() => actions.forceAdvance())}>
            Start the clock now (host)
          </button>
        )}
        {practice && (
          <button className="link center" onClick={() => actions.changeSettings?.()}>
            Change settings
          </button>
        )}
      </div>
    </Screen>
  );
}
