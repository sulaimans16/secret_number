import { useState } from 'react';
import { api, type Player, type Room, type Session } from '../lib/api';
import { MODES } from '../lib/rules';
import { Avatar, ErrorLine, Screen, Typewriter } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';

export function Briefing({ session, room, players, me }: { session: Session; room: Room; players: Player[]; me: Player }) {
  const [error, setError] = useState<string | null>(null);
  const isHost = room.host_player === session.player_id;
  const readyCount = players.filter((p) => p.ready).length;

  const act = (fn: () => Promise<unknown>) => fn().catch((e: Error) => setError(e.message));

  return (
    <Screen className="screen--scroll briefing">
      <div className="announce">
        <span className="eyebrow">Main match · {MODES[room.mode].title}</span>
        <h1 className="title title--xl">
          <Typewriter text="Your numbers have been sealed." />
        </h1>
        <p className="muted">Read the rules. When everyone is ready, the clock starts.</p>
      </div>

      <RulesOverview mode={room.mode} minutes={room.invest_minutes} />

      <section className="panel">
        <div className="panel__head">
          <h2>Ready</h2>
          <span className="pill">
            {readyCount} / {players.length}
          </span>
        </div>
        <ul className="ready-list">
          {players.map((p) => (
            <li key={p.id} className={p.ready ? 'is-ready' : ''}>
              <Avatar name={p.name} seat={p.seat} />
              <span>{p.name}</span>
              <b>{p.ready ? 'READY' : '…'}</b>
            </li>
          ))}
        </ul>
      </section>

      <ErrorLine error={error} />
      <div className="dock">
        <button className="btn btn--primary btn--block" disabled={me.ready} onClick={() => act(() => api.ready(session))}>
          {me.ready ? 'Waiting for the others…' : 'I understand. Begin.'}
        </button>
        {isHost && (
          <button className="link center" onClick={() => act(() => api.forceAdvance(session))}>
            Start the clock now (host)
          </button>
        )}
      </div>
    </Screen>
  );
}
