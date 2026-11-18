import { useMemo, useState } from 'react';
import { api, type Clue, type Player, type Room, type Session, type Visit } from '../lib/api';
import { MODES, TICKETS, ticketList, type Ticket } from '../lib/rules';
import { fmtClock, useCountdown } from '../hooks/useRoom';
import { useNotes } from '../hooks/useNotes';
import { Avatar, ErrorLine, Modal, Screen } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';

interface Props {
  session: Session;
  room: Room;
  players: Player[];
  visits: Visit[];
  clues: Clue[];
  me: Player;
  refresh: () => Promise<void>;
}

type Tab = 'players' | 'clues' | 'feed';

export function Investigation({ session, room, players, visits, clues, me, refresh }: Props) {
  const left = useCountdown(room.phase_ends_at, room.id);
  const [target, setTarget] = useState<Player | null>(null);
  const [tab, setTab] = useState<Tab>('players');
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ name: string; ticket: Ticket; result: string } | null>(null);
  const { notes, update } = useNotes(room.id, room.round);
  const isHost = room.host_player === session.player_id;
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const others = players.filter((p) => p.id !== me.id);
  const tickets = ticketList(me.tickets);
  const ticketsLeft = tickets.reduce((s, [, n]) => s + n, 0);
  const urgent = left <= 60;

  const used = (to: string, t: Ticket) => visits.some((v) => v.from_player === me.id && v.to_player === to && v.ticket === t);
  const cluesWith = (id: string) => clues.filter((c) => c.from_player === id || c.to_player === id);

  async function visit(t: Ticket) {
    if (!target) return;
    setError(null);
    try {
      const r = await api.useTicket(session, target.id, t);
      setFlash({ name: target.name, ticket: t, result: r.result });
      setTarget(null);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Screen className={`screen--scroll game ${urgent ? 'is-urgent' : ''}`}>
      <header className="hud">
        <div>
          <span className="eyebrow">Investigation</span>
          <div className={`clock ${urgent ? 'clock--urgent' : ''}`} role="timer" aria-live="off">
            {fmtClock(left)}
          </div>
        </div>
        <div className="hud__right">
          <span className="eyebrow">Your number</span>
          <div className="sealed" aria-label="Your number is hidden">
            ??
          </div>
        </div>
      </header>

      <section className="tray" aria-label="Your tickets">
        {tickets.map(([t, n]) => (
          <span key={t} className={`ticket ${n === 0 ? 'ticket--spent' : ''}`} title={TICKETS[t].name}>
            <span className="ticket__sym">{TICKETS[t].symbol}</span>
            <span className="ticket__n">×{n}</span>
          </span>
        ))}
        <button className="link small" onClick={() => setRules(true)}>
          Rules
        </button>
      </section>

      <div className="seg seg--tabs" role="tablist">
        {(
          [
            ['players', 'Players'],
            ['clues', `My clues${clues.length ? ` · ${clues.length}` : ''}`],
            ['feed', 'Activity'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="seg__btn" onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'players' && (
        <ul className="targets">
          {others.map((p) => {
            const cl = cluesWith(p.id);
            return (
              <li key={p.id}>
                <button className="target" onClick={() => setTarget(p)} disabled={ticketsLeft === 0}>
                  <Avatar name={p.name} seat={p.seat} />
                  <span className="target__body">
                    <span className="target__name">{p.name}</span>
                    <span className="target__clues">
                      {cl.length === 0 ? (
                        <span className="muted">No clues yet</span>
                      ) : (
                        cl.map((c) => (
                          <span key={c.visit_id} className="clue-chip">
                            {TICKETS[c.ticket].symbol} {c.result}
                          </span>
                        ))
                      )}
                    </span>
                  </span>
                  {notes[p.id]?.guess && <span className="target__guess">{notes[p.id].guess}?</span>}
                  <span className="target__go" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'clues' && (
        <section className="log">
          {clues.length === 0 && <p className="muted center">Spend a ticket, or wait for someone to visit you.</p>}
          {[...clues].reverse().map((c) => {
            const other = byId[c.from_player === me.id ? c.to_player : c.from_player];
            const mine = c.from_player === me.id;
            return (
              <article key={c.visit_id} className="log__row">
                <span className="ticket-chip">{TICKETS[c.ticket].symbol}</span>
                <div>
                  <div className="log__eq">
                    You {TICKETS[c.ticket].symbol} {other?.name ?? '?'} = <b>{c.result}</b>
                  </div>
                  <div className="muted small">
                    {mine ? `You visited ${other?.name}` : `${other?.name} visited you`} · {TICKETS[c.ticket].name}
                  </div>
                </div>
              </article>
            );
          })}
          <section className="panel notes">
            <div className="panel__head">
              <h2>Private notes</h2>
            </div>
            <p className="muted small">Saved on this device only. Your suspected numbers are filled in for you when guessing starts.</p>
            {[me, ...others].map((p) => (
              <div key={p.id} className="note-row">
                <span className="note-row__name">{p.id === me.id ? 'Me' : p.name}</span>
                <input
                  className="note-row__guess"
                  inputMode="numeric"
                  placeholder="#"
                  aria-label={`Suspected number for ${p.name}`}
                  value={notes[p.id]?.guess ?? ''}
                  onChange={(e) => update(p.id, { guess: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
                <input
                  className="note-row__text"
                  placeholder="Notes…"
                  aria-label={`Notes on ${p.name}`}
                  value={notes[p.id]?.text ?? ''}
                  onChange={(e) => update(p.id, { text: e.target.value })}
                />
              </div>
            ))}
          </section>
        </section>
      )}

      {tab === 'feed' && (
        <section className="log">
          {visits.length === 0 && <p className="muted center">The halls are quiet.</p>}
          {[...visits].reverse().map((v) => (
            <article key={v.id} className="feed__row">
              <span className="feed__time">{new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span>
                <b>{v.from_player === me.id ? 'You' : byId[v.from_player]?.name}</b> entered{' '}
                <b>{v.to_player === me.id ? 'your' : `${byId[v.to_player]?.name}’s`}</b> room
              </span>
              <span className="ticket-chip ticket-chip--sm">{TICKETS[v.ticket].symbol}</span>
            </article>
          ))}
        </section>
      )}

      {isHost && (
        <div className="dock dock--quiet">
          <button
            className="link center"
            onClick={() => {
              if (confirm('End the investigation now for everyone?')) api.forceAdvance(session).catch((e: Error) => setError(e.message));
            }}
          >
            End investigation now (host)
          </button>
        </div>
      )}
      <ErrorLine error={error} />

      {target && (
        <Modal label={`Visit ${target.name}`} onClose={() => (setTarget(null), setError(null))}>
          <span className="eyebrow">Entering the room of</span>
          <h2 className="title title--sm">{target.name}</h2>
          <p className="muted small">Choose a ticket. Both of you will see the result.</p>
          <div className="ticket-pick">
            {ticketList(me.tickets).map(([t, n]) => {
              const dup = used(target.id, t);
              return (
                <button key={t} className="ticket-opt" disabled={n === 0 || dup} onClick={() => visit(t)}>
                  <span className="ticket-chip">{TICKETS[t].symbol}</span>
                  <span className="ticket-opt__body">
                    <b>{TICKETS[t].name}</b>
                    <span className="small muted">{dup ? 'Already used on this player' : n === 0 ? 'None left' : `${n} left`}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <ErrorLine error={error} />
        </Modal>
      )}

      {flash && (
        <Modal label="Clue result" onClose={() => setFlash(null)}>
          <div className="reveal-clue">
            <span className="eyebrow">{TICKETS[flash.ticket].name}</span>
            <p className="reveal-clue__eq">
              You {TICKETS[flash.ticket].symbol} {flash.name}
            </p>
            <div className="reveal-clue__num">{flash.result}</div>
            <button className="btn btn--primary btn--block" onClick={() => setFlash(null)}>
              Noted
            </button>
          </div>
        </Modal>
      )}

      {rules && (
        <Modal label="Rules" onClose={() => setRules(false)}>
          <h2 className="title title--sm">{MODES[room.mode].title}</h2>
          <RulesOverview mode={room.mode} minutes={room.invest_minutes} />
        </Modal>
      )}
    </Screen>
  );
}
