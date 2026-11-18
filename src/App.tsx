import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, loadSession, saveSession, type Session } from './lib/api';
import type { GameActions, GameView } from './lib/engine';
import { useRoom } from './hooks/useRoom';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { Briefing } from './screens/Briefing';
import { Investigation } from './screens/Investigation';
import { Guessing } from './screens/Guessing';
import { Reveal } from './screens/Reveal';
import { PracticeSetup } from './screens/PracticeSetup';
import { Screen } from './components/ui';
import { clearPractice, loadPractice, newPractice, usePractice } from './practice/usePractice';
import type { PracticeState } from './practice/engine';

type Mode = { kind: 'home' } | { kind: 'online'; session: Session } | { kind: 'setup' } | { kind: 'practice'; game: PracticeState };

export default function App() {
  const linkCode = new URLSearchParams(location.search).get('code')?.toUpperCase() ?? undefined;
  const [mode, setMode] = useState<Mode>(() => {
    const s = loadSession();
    // an invite link for a different room takes priority over a stale session
    if (s && (!linkCode || s.code === linkCode)) return { kind: 'online', session: s };
    const p = !linkCode && loadPractice();
    if (p) return { kind: 'practice', game: p };
    return { kind: 'home' };
  });

  const home = useCallback(() => {
    saveSession(null);
    clearPractice();
    history.replaceState(null, '', '/');
    setMode({ kind: 'home' });
  }, []);
  const setup = useCallback(() => setMode({ kind: 'setup' }), []);

  let body;
  switch (mode.kind) {
    case 'home':
      body = (
        <Landing
          initialCode={linkCode}
          onPractice={setup}
          onSession={(s) => {
            saveSession(s);
            history.replaceState(null, '', '/');
            setMode({ kind: 'online', session: s });
          }}
        />
      );
      break;
    case 'setup':
      body = <PracticeSetup onBack={home} onStart={(s) => setMode({ kind: 'practice', game: newPractice(s) })} />;
      break;
    case 'online':
      body = <OnlineGame session={mode.session} onLeave={home} />;
      break;
    case 'practice':
      body = <PracticeGame key={mode.game.room.id} game={mode.game} onLeave={home} onSettings={setup} />;
      break;
  }

  return <Shell>{body}</Shell>;
}

function OnlineGame({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const state = useRoom(session);
  const { room, me, refresh } = state;

  useEffect(() => {
    if (state.gone) onLeave();
  }, [state.gone, onLeave]);

  const actions: GameActions = useMemo(
    () => ({
      useTicket: async (target, ticket) => {
        const r = await api.useTicket(session, target, ticket);
        void refresh();
        return r;
      },
      submitGuesses: (g) => api.submitGuesses(session, g),
      ready: () => api.ready(session),
      forceAdvance: () => api.forceAdvance(session),
      rematch: () => api.rematch(session),
      leave: onLeave,
      revealGuesses: () => api.revealGuesses(session.room_id),
      tick: () => void api.tick(session.room_id).catch(() => {}),
    }),
    [session, refresh, onLeave],
  );

  if (!room || !me) return <Loading />;
  if (room.status === 'lobby') return <Lobby session={session} room={room} players={state.players} onLeave={onLeave} />;
  const view: GameView = {
    kind: 'online',
    room,
    players: state.players,
    visits: state.visits,
    clues: state.clues,
    me,
    isHost: room.host_player === session.player_id,
  };
  return <Phase view={view} actions={actions} />;
}

function PracticeGame({ game, onLeave, onSettings }: { game: PracticeState; onLeave: () => void; onSettings: () => void }) {
  const { view, actions } = usePractice(game, onLeave, onSettings);
  return <Phase view={view} actions={actions} />;
}

function Phase({ view, actions }: { view: GameView; actions: GameActions }) {
  const k = `${view.room.id}-${view.room.round}`;
  switch (view.room.status) {
    case 'briefing':
      return <Briefing key={k} view={view} actions={actions} />;
    case 'investigation':
      return <Investigation key={k} view={view} actions={actions} />;
    case 'guessing':
      return <Guessing key={k} view={view} actions={actions} />;
    case 'reveal':
      return <Reveal key={k} view={view} actions={actions} />;
    default:
      return <Loading />;
  }
}

const Loading = () => (
  <Screen className="center-screen">
    <div className="loader" aria-label="Loading" />
  </Screen>
);

/** Atmosphere layers behind every screen. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <div className="fx-vignette" aria-hidden />
      <div className="fx-scan" aria-hidden />
      {children}
    </div>
  );
}
