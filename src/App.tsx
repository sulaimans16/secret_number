import { useEffect, useState } from 'react';
import { loadSession, saveSession, type Session } from './lib/api';
import { useRoom } from './hooks/useRoom';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { Briefing } from './screens/Briefing';
import { Investigation } from './screens/Investigation';
import { Guessing } from './screens/Guessing';
import { Reveal } from './screens/Reveal';
import { Screen } from './components/ui';

export default function App() {
  const params = new URLSearchParams(location.search);
  const linkCode = params.get('code')?.toUpperCase() ?? undefined;
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    // an invite link for a different room takes priority over a stale session
    return s && (!linkCode || s.code === linkCode) ? s : null;
  });
  const state = useRoom(session);

  const enter = (s: Session) => {
    saveSession(s);
    setSession(s);
    history.replaceState(null, '', '/');
  };
  const leave = () => {
    saveSession(null);
    setSession(null);
    history.replaceState(null, '', '/');
  };

  useEffect(() => {
    if (state.gone) leave();
  }, [state.gone]);

  // phase transitions get a short red flicker
  const status = state.room?.status;
  const [flicker, setFlicker] = useState(false);
  useEffect(() => {
    if (!status) return;
    setFlicker(true);
    const t = window.setTimeout(() => setFlicker(false), 700);
    return () => window.clearTimeout(t);
  }, [status]);

  let body;
  if (!session) body = <Landing onSession={enter} initialCode={linkCode} />;
  else if (!state.room || !state.me)
    body = (
      <Screen className="center-screen">
        <div className="loader" aria-label="Loading" />
      </Screen>
    );
  else {
    const { room, players, visits, clues, me, refresh } = state;
    switch (room.status) {
      case 'lobby':
        body = <Lobby session={session} room={room} players={players} onLeave={leave} />;
        break;
      case 'briefing':
        body = <Briefing session={session} room={room} players={players} me={me} />;
        break;
      case 'investigation':
        body = (
          <Investigation session={session} room={room} players={players} visits={visits} clues={clues} me={me} refresh={refresh} />
        );
        break;
      case 'guessing':
        body = <Guessing key={room.round} session={session} room={room} players={players} clues={clues} me={me} />;
        break;
      case 'reveal':
        body = <Reveal session={session} room={room} players={players} me={me} onLeave={leave} />;
        break;
    }
  }

  return (
    <div className={`app ${flicker ? 'is-flicker' : ''}`}>
      <div className="fx-vignette" aria-hidden />
      <div className="fx-scan" aria-hidden />
      {body}
    </div>
  );
}
