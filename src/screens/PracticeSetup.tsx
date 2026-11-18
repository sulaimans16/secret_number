import { useState } from 'react';
import type { Difficulty } from '../lib/engine';
import { MODES, type Mode } from '../lib/rules';
import type { PracticeSettings } from '../practice/engine';
import { Brand, Screen } from '../components/ui';
import { Stepper } from '../components/Stepper';

const LEVELS: { id: Difficulty; title: string; line: string }[] = [
  { id: 'easy', title: 'Easy', line: 'Bots wander and guess wildly. The coach is on to show what your clues prove.' },
  { id: 'medium', title: 'Medium', line: 'Bots pick useful visits, share honest clues in chat, and guess only when close.' },
  { id: 'hard', title: 'Hard', line: 'Bots play sharp, ignore claims that don’t add up, and lie to you about a quarter of the time.' },
];

const KEY = 'secret-number-practice-settings';

export function PracticeSetup({ onStart, onBack }: { onStart: (s: PracticeSettings) => void; onBack: () => void }) {
  const [s, setS] = useState<PracticeSettings>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return JSON.parse(saved) as PracticeSettings;
    } catch {
      /* ignore */
    }
    let name = 'You';
    try {
      name = localStorage.getItem('secret-number-name') || 'You';
    } catch {
      /* ignore */
    }
    return { name, mode: 'casual', bots: 3, difficulty: 'medium', minutes: 5 };
  });
  const cfg = MODES[s.mode];
  const setMode = (mode: Mode) => {
    const c = MODES[mode];
    setS({ ...s, mode, bots: Math.min(c.maxPlayers - 1, Math.max(c.minPlayers - 1, s.bots)) });
  };

  const start = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    onStart(s);
  };

  return (
    <Screen className="screen--scroll">
      <header className="topbar">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <Brand small />
      </header>
      <div className="announce">
        <span className="eyebrow">Single play</span>
        <h1 className="title">Practice vs bots</h1>
        <p className="muted">Learn the game against bots. Nothing leaves your phone.</p>
      </div>

      <section className="panel stack">
        <div className="panel__head">
          <h2>Rule set</h2>
        </div>
        <div className="seg" role="radiogroup" aria-label="Rule set">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} role="radio" aria-checked={s.mode === m} className="seg__btn" onClick={() => setMode(m)}>
              {MODES[m].title}
            </button>
          ))}
        </div>
        <p className="muted small">{cfg.tagline}</p>
        <Stepper
          label="Bots"
          value={s.bots}
          min={cfg.minPlayers - 1}
          max={cfg.maxPlayers - 1}
          onChange={(bots) => setS({ ...s, bots })}
        />
        <Stepper label="Investigation time" suffix=" min" value={s.minutes} min={1} max={15} onChange={(minutes) => setS({ ...s, minutes })} />
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Difficulty</h2>
        </div>
        <div className="levels" role="radiogroup" aria-label="Difficulty">
          {LEVELS.map((l) => (
            <button key={l.id} role="radio" aria-checked={s.difficulty === l.id} className="level" onClick={() => setS({ ...s, difficulty: l.id })}>
              <b>{l.title}</b>
              <span className="small muted">{l.line}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="dock">
        <button className="btn btn--primary btn--block" onClick={start}>
          Enter the game
        </button>
      </div>
    </Screen>
  );
}
