import { useMemo, useState } from 'react';
import type { Player } from '../lib/api';
import type { GameActions, GameView } from '../lib/engine';
import { MODES, TICKETS, ticketList, type Ticket } from '../lib/rules';
import { fmtClock, useCountdown } from '../hooks/useRoom';
import { useNotes } from '../hooks/useNotes';
import { candidates, contradicts, type Fact } from '../practice/solver';
import { Avatar, ErrorLine, Modal, Screen } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';
import { NotesPanel, fmtPossible } from '../components/NotesPanel';

type Tab = 'players' | 'clues' | 'notes' | 'feed';

export function Investigation({ view, actions }: { view: GameView; actions: GameActions }) {
  const { room, players, visits, clues, me, isHost } = view;
  const practice = view.kind === 'practice';
  const messages = view.messages ?? [];
  const left = useCountdown(room.phase_ends_at, actions.tick);
  const [target, setTarget] = useState<Player | null>(null);
  const [tab, setTab] = useState<Tab>('players');
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ name: string; ticket: Ticket; result: string } | null>(null);
  const [coach, setCoach] = useState(view.difficulty === 'easy');
  const [trustChat, setTrustChat] = useState(false);
  const notes = useNotes(room.id, room.round);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const others = players.filter((p) => p.id !== me.id);
  const tickets = ticketList(me.tickets);
  const ticketsLeft = tickets.reduce((s, [, n]) => s + n, 0);
  const urgent = left <= 60;
  const max = MODES[room.mode].maxNumber;

  // coach: what can be deduced from your clues (plus chat claims, if you trust them)
  const claims = messages.filter((m) => m.claim).map((m) => ({ ...m.claim!, a: m.claim!.a, b: m.claim!.b }) as Fact);
  const facts: Fact[] = clues.map((c) => ({ a: c.from_player, b: c.to_player, ticket: c.ticket, result: c.result }));
  const possible = useMemo(
    () => (practice && coach ? candidates(trustChat ? [...facts, ...claims] : facts, players.map((p) => p.id), room.mode) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [practice, coach, trustChat, clues.length, messages.length, players.length, room.mode],
  );
  const contradiction = possible && contradicts(possible);

  const used = (to: string, t: Ticket) => visits.some((v) => v.from_player === me.id && v.to_player === to && v.ticket === t);
  const cluesWith = (id: string) => clues.filter((c) => c.from_player === id || c.to_player === id);

  async function visit(t: Ticket) {
    if (!target) return;
    setError(null);
    try {
      const r = await actions.useTicket(target.id, t);
      setFlash({ name: target.name, ticket: t, result: r.result });
      setTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // one timeline of visits and chat
  const feed = [
    ...visits.map((v) => ({ kind: 'visit' as const, at: v.created_at, key: `v${v.id}`, v })),
    ...messages.map((m) => ({ kind: 'msg' as const, at: m.at, key: `m${m.id}`, m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const tabs: [Tab, string][] = [
    ['players', 'Players'],
    ['clues', `Clues${clues.length ? ` ${clues.length}` : ''}`],
    ['notes', 'Notes'],
    ['feed', practice ? 'Chat' : 'Activity'],
  ];

  return (
    <Screen className={`screen--scroll game ${urgent ? 'is-urgent' : ''}`}>
      <header className="hud">
        <div>
          <span className="eyebrow">{practice ? `Practice · ${view.difficulty}` : 'Investigation'}</span>
          <div className={`clock ${urgent ? 'clock--urgent' : ''}`} role="timer" aria-live="off">
            {fmtClock(left)}
          </div>
        </div>
        <div className="hud__right">
          <span className="eyebrow">Your number</span>
          <div className="sealed" aria-label="Your number is hidden">
            {possible?.[me.id]?.length === 1 ? possible[me.id][0] : '??'}
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

      {practice && (
        <div className="coachbar">
          <label className="toggle">
            <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} />
            <span>Coach</span>
          </label>
          {coach && (
            <label className="toggle">
              <input type="checkbox" checked={trustChat} onChange={(e) => setTrustChat(e.target.checked)} />
              <span>Trust chat claims</span>
            </label>
          )}
          {coach && possible && (
            <span className={`small ${contradiction ? 'neg' : 'muted'}`}>
              {contradiction ? 'These claims contradict each other. Someone lied.' : `You: ${fmtPossible(possible[me.id])}`}
            </span>
          )}
        </div>
      )}

      <div className="seg seg--tabs" role="tablist">
        {tabs.map(([k, l]) => (
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
                <button className="target" onClick={() => setTarget(p)}>
                  <Avatar name={p.name} seat={p.seat} />
                  <span className="target__body">
                    <span className="target__name">
                      {p.name}
                      {possible && <span className="target__coach">{fmtPossible(possible[p.id])}</span>}
                    </span>
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
                  {notes.notes[p.id]?.guess && <span className="target__guess">{notes.notes[p.id].guess}?</span>}
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
        </section>
      )}

      {tab === 'notes' && <NotesPanel store={notes} players={players} me={me} max={max} possible={possible} />}

      {tab === 'feed' && (
        <section className="log">
          {feed.length === 0 && <p className="muted center">The halls are quiet.</p>}
          {feed.map((f) =>
            f.kind === 'visit' ? (
              <article key={f.key} className="feed__row">
                <span className="feed__time">{time(f.at)}</span>
                <span>
                  <b>{f.v.from_player === me.id ? 'You' : byId[f.v.from_player]?.name}</b> entered{' '}
                  <b>{f.v.to_player === me.id ? 'your' : `${byId[f.v.to_player]?.name}’s`}</b> room
                </span>
                <span className="ticket-chip ticket-chip--sm">{TICKETS[f.v.ticket].symbol}</span>
              </article>
            ) : (
              <article key={f.key} className={`chat ${f.m.to ? 'chat--whisper' : ''}`}>
                <Avatar name={byId[f.m.from]?.name ?? '?'} seat={byId[f.m.from]?.seat ?? 0} />
                <div>
                  <div className="chat__who">
                    {byId[f.m.from]?.name}
                    {f.m.to && <span className="muted"> whispers to you</span>}
                    <span className="feed__time"> {time(f.m.at)}</span>
                  </div>
                  <div className="chat__text">{f.m.text}</div>
                </div>
              </article>
            ),
          )}
        </section>
      )}

      <div className="dock dock--quiet">
        {(isHost || practice) && (
          <button
            className="link center"
            onClick={() => {
              if (confirm(practice ? 'Skip to final answers?' : 'End the investigation now for everyone?'))
                actions.forceAdvance().catch((e: Error) => setError(e.message));
            }}
          >
            {practice ? 'Skip to final answers' : 'End investigation now (host)'}
          </button>
        )}
      </div>
      <ErrorLine error={error} />

      {target && (
        <Modal label={`Visit ${target.name}`} onClose={() => (setTarget(null), setError(null))}>
          <span className="eyebrow">Entering the room of</span>
          <h2 className="title title--sm">{target.name}</h2>
          <p className="muted small">
            {ticketsLeft > 0 ? 'Choose a ticket. Both of you will see the result.' : 'You have no tickets left.'}
          </p>
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
            {practice && actions.ask && (
              <button
                className="ticket-opt"
                onClick={async () => {
                  await actions.ask!(target.id);
                  setTarget(null);
                  setTab('feed');
                }}
              >
                <span className="ticket-chip">?</span>
                <span className="ticket-opt__body">
                  <b>Ask for a clue</b>
                  <span className="small muted">Costs nothing. They might tell the truth.</span>
                </span>
              </button>
            )}
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

const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
