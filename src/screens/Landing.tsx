import { useState } from 'react';
import { api, type Session } from '../lib/api';
import { MODES, type Mode } from '../lib/rules';
import { Brand, ErrorLine, Screen, Typewriter } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';

type View = 'home' | 'create' | 'join' | 'rules';

export function Landing({ onSession, initialCode }: { onSession: (s: Session) => void; initialCode?: string }) {
  const [view, setView] = useState<View>(initialCode ? 'join' : 'home');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('secret-number-name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState(initialCode ?? '');
  const [rulesMode, setRulesMode] = useState<Mode>('full');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remember = (n: string) => {
    try {
      localStorage.setItem('secret-number-name', n);
    } catch {
      /* ignore */
    }
  };

  async function go(fn: () => Promise<Session>) {
    setError(null);
    if (!name.trim()) return setError('Enter your name.');
    setBusy(true);
    try {
      remember(name.trim());
      onSession(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (view === 'rules') {
    return (
      <Screen className="screen--scroll">
        <header className="topbar">
          <button className="link" onClick={() => setView('home')}>
            ← Back
          </button>
          <Brand small />
        </header>
        <h1 className="title">How to play</h1>
        <div className="seg" role="tablist" aria-label="Rule set">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={rulesMode === m} className="seg__btn" onClick={() => setRulesMode(m)}>
              {MODES[m].title}
            </button>
          ))}
        </div>
        <RulesOverview mode={rulesMode} />
        <button className="btn btn--primary btn--block" onClick={() => setView('home')}>
          I understand
        </button>
      </Screen>
    );
  }

  return (
    <Screen className="landing">
      <div className="landing__hero">
        <Brand />
        <p className="landing__line">
          <Typewriter text="Everyone holds a number. No one can see their own." />
        </p>
      </div>

      {view === 'home' && (
        <div className="stack">
          <button className="btn btn--primary btn--block" onClick={() => setView('create')}>
            Create a group
          </button>
          <button className="btn btn--block" onClick={() => setView('join')}>
            Join a group
          </button>
          <button className="link center" onClick={() => setView('rules')}>
            How to play
          </button>
        </div>
      )}

      {(view === 'create' || view === 'join') && (
        <form
          className="stack card"
          onSubmit={(e) => {
            e.preventDefault();
            if (view === 'create') {
              const m = MODES.full;
              void go(() => api.createRoom(name.trim(), 'full', 6, m.defaultMinutes));
            } else {
              if (code.trim().length < 4) return setError('Enter the 4-character room code.');
              void go(() => api.joinRoom(code.trim(), name.trim()));
            }
          }}
        >
          <h2 className="card__title">{view === 'create' ? 'Create a group' : 'Join a group'}</h2>
          <label className="field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="nickname"
              placeholder="What should they call you?"
              autoFocus
            />
          </label>
          {view === 'join' && (
            <label className="field">
              <span>Room code</span>
              <input
                className="input--code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                maxLength={4}
                autoCapitalize="characters"
                placeholder="XXXX"
                inputMode="text"
              />
            </label>
          )}
          {view === 'create' && (
            <p className="muted small">You’ll choose the rule set and the number of players in the lobby.</p>
          )}
          <ErrorLine error={error} />
          <button className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Opening…' : view === 'create' ? 'Open the room' : 'Enter'}
          </button>
          <button
            type="button"
            className="link center"
            onClick={() => {
              setError(null);
              setView('home');
            }}
          >
            Back
          </button>
        </form>
      )}

      <p className="footnote">A deduction game for friends, inspired by reality-TV mind games.</p>
    </Screen>
  );
}
