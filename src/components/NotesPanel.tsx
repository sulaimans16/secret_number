import type { Player } from '../lib/api';
import type { NotesStore } from '../hooks/useNotes';

interface Props {
  store: NotesStore;
  players: Player[];
  me: Player;
  max: number;
  /** optional coach hints: numbers still possible for each player */
  possible?: Record<string, number[]>;
}

export function NotesPanel({ store, players, me, max, possible }: Props) {
  const { notes, update, grid, cycle, resetGrid } = store;
  const others = players.filter((p) => p.id !== me.id);
  const nums = Array.from({ length: max }, (_, i) => i + 1);
  const open = nums.filter((n) => grid[n] !== 'x');
  const coach = possible?.[me.id];

  return (
    <div className="notes">
      <section className="panel">
        <div className="panel__head">
          <h2>My number</h2>
          <span className="pill">{open.length} still possible</span>
        </div>
        <p className="muted small">
          Tap a number once to cross it out, twice to mark it likely, and a third time to clear it.
          {coach && ` Coach: ${coach.length} possible from your clues.`}
        </p>
        <div className={`grid grid--${max}`} role="group" aria-label="Your possible numbers">
          {nums.map((n) => {
            const hinted = coach && !coach.includes(n);
            return (
              <button
                key={n}
                className={`grid__n ${grid[n] ? `is-${grid[n]}` : ''} ${hinted ? 'is-hinted' : ''}`}
                aria-pressed={!!grid[n]}
                aria-label={`${n}${grid[n] === 'x' ? ', crossed out' : grid[n] === 'likely' ? ', likely' : ''}`}
                onClick={() => cycle(n)}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="row-between">
          {open.length === 1 ? (
            <span className="small gold">Only {open[0]} left. It will be filled in as your guess.</span>
          ) : (
            <span />
          )}
          <button className="link small" onClick={resetGrid}>
            Reset grid
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Players</h2>
        </div>
        <p className="muted small">Notes stay on this device. Suspected numbers are filled in as your guesses when time runs out.</p>
        {others.map((p) => (
          <div key={p.id} className="note-row">
            <span className="note-row__name">
              {p.name}
              {possible?.[p.id] && <span className="note-row__hint">{fmtPossible(possible[p.id])}</span>}
            </span>
            <input
              className="note-row__guess"
              inputMode="numeric"
              placeholder="#"
              aria-label={`Suspected number for ${p.name}`}
              value={notes[p.id]?.guess ?? ''}
              onChange={(e) => update(p.id, { guess: e.target.value.replace(/\D/g, '').slice(0, 3) })}
            />
            <textarea
              className="note-row__text"
              rows={1}
              placeholder="Notes…"
              aria-label={`Notes on ${p.name}`}
              value={notes[p.id]?.text ?? ''}
              onChange={(e) => update(p.id, { text: e.target.value })}
            />
          </div>
        ))}
        <label className="field">
          <span>General notes</span>
          <textarea
            rows={3}
            placeholder="Alliances, suspicions, lies…"
            value={notes['_general']?.text ?? ''}
            onChange={(e) => update('_general', { text: e.target.value })}
          />
        </label>
      </section>
    </div>
  );
}

export const fmtPossible = (xs: number[]) =>
  xs.length === 0 ? 'contradiction' : xs.length === 1 ? `= ${xs[0]}` : xs.length <= 4 ? xs.join(' / ') : `${xs.length} options`;
