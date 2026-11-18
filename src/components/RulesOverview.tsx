import { MODES, SCORING, TICKETS, ticketList, type Mode } from '../lib/rules';

export function RulesOverview({ mode, minutes }: { mode: Mode; minutes?: number }) {
  const m = MODES[mode];
  const mins = minutes ?? m.defaultMinutes;
  return (
    <div className="rules">
      <section className="rules__step">
        <span className="rules__num">I</span>
        <div>
          <h3>A number is sealed to you</h3>
          <p>
            Every player gets a different secret number from <b>1</b> to <b>{m.maxNumber}</b>.{' '}
            <b>Nobody sees any number, including their own.</b>
          </p>
        </div>
      </section>

      <section className="rules__step">
        <span className="rules__num">II</span>
        <div>
          <h3>Visit rooms. Spend tickets.</h3>
          <p>
            For <b>{mins} minutes</b> you investigate. Pick another player and spend a ticket. The machine combines{' '}
            <b>your number with theirs</b> and shows the result <b>to both of you</b>. Everyone else only sees that a
            visit happened.
          </p>
          <ul className="rules__tickets">
            {ticketList(m.tickets).map(([t, n]) => (
              <li key={t}>
                <span className="ticket-chip">{TICKETS[t].symbol}</span>
                <div>
                  <b>
                    {TICKETS[t].name} ×{n}
                  </b>
                  <span>{TICKETS[t].describe(mode)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="muted">You can’t use the same ticket type on the same player twice.</p>
        </div>
      </section>

      <section className="rules__step">
        <span className="rules__num">III</span>
        <div>
          <h3>Talk. Trade. Lie.</h3>
          <p>
            Clues only help when you combine them with other players’ clues. Share your clues, trade them, form
            alliances, or lie. Whatever you say out loud is not checked.
          </p>
        </div>
      </section>

      <section className="rules__step">
        <span className="rules__num">IV</span>
        <div>
          <h3>Name the numbers</h3>
          <p>
            When time runs out you get {m.guessMinutes} minutes to write down guesses for your own number and anyone
            else’s.
          </p>
          <table className="rules__score">
            <tbody>
              <tr>
                <td>Your own number, correct</td>
                <td className="pos">+{SCORING.ownRight}</td>
              </tr>
              <tr>
                <td>Your own number, wrong</td>
                <td className="neg">{SCORING.ownWrong}</td>
              </tr>
              <tr>
                <td>Each other player’s number you get right</td>
                <td className="pos">+{SCORING.otherRight}</td>
              </tr>
              <tr>
                <td>Nobody guessed your number</td>
                <td className="pos">+{SCORING.secretKept}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">Leaving your own guess blank scores 0. The lowest score is eliminated.</p>
        </div>
      </section>
    </div>
  );
}
