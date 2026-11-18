import { useEffect, useRef, useState } from 'react';
import { api, type Player, type Room, type Session } from '../lib/api';
import { MODES, type Mode } from '../lib/rules';
import { Avatar, Brand, ErrorLine, Modal, Screen } from '../components/ui';
import { RulesOverview } from '../components/RulesOverview';

interface Props {
  session: Session;
  room: Room;
  players: Player[];
  onLeave: () => void;
}

export function Lobby({ session, room, players, onLeave }: Props) {
  const isHost = room.host_player === session.player_id;
  const cfg = MODES[room.mode];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const enough = players.length >= cfg.minPlayers;
  const link = `${location.origin}/?code=${room.code}`;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // local copy so rapid taps feel instant; pushed to the server after a short pause
  const [draft, setDraft] = useState({ mode: room.mode, max: room.max_players, minutes: room.invest_minutes });
  const timer = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (timer.current === null) setDraft({ mode: room.mode, max: room.max_players, minutes: room.invest_minutes });
  }, [room.mode, room.max_players, room.invest_minutes]);

  const setSettings = (mode: Mode, max: number, minutes: number) => {
    const c = MODES[mode];
    const m = Math.max(Math.max(c.minPlayers, players.length), Math.min(c.maxPlayers, max));
    const next = { mode, max: m, minutes };
    setDraft(next);
    setSaving(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void run(() => api.updateSettings(session, next.mode, next.max, next.minutes)).finally(() => {
        timer.current = null;
        setSaving(false);
      });
    }, 350);
  };

  async function share() {
    const data = { title: 'Secret Number', text: `Join my Secret Number room: ${room.code}`, url: link };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user cancelled */
    }
  }

  const seats = Array.from({ length: room.max_players }, (_, i) => players.find((p) => p.seat === i + 1) ?? null);

  return (
    <Screen className="screen--scroll">
      <header className="topbar">
        <Brand small />
        <button className="link" onClick={() => setShowRules(true)}>
          Rules
        </button>
      </header>

      <section className="code-card">
        <span className="eyebrow">Room code</span>
        <button className="code-card__code" onClick={share} aria-label={`Room code ${room.code}. Tap to share`}>
          {room.code.split('').map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </button>
        <button className="link" onClick={share}>
          {copied ? 'Link copied' : 'Share invite link'}
        </button>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Players</h2>
          <span className="pill">
            {players.length} / {room.max_players}
          </span>
        </div>
        <ul className="seats">
          {seats.map((p, i) => (
            <li key={i} className={`seat ${p ? 'seat--taken' : ''}`}>
              {p ? (
                <>
                  <Avatar name={p.name} seat={p.seat} />
                  <span className="seat__name">
                    {p.name}
                    {p.id === session.player_id && <em> (you)</em>}
                  </span>
                  {p.id === room.host_player && <span className="tag">HOST</span>}
                </>
              ) : (
                <span className="seat__empty">Seat {String(i + 1).padStart(2, '0')}: empty</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Rules of this game</h2>
        </div>
        {isHost ? (
          <div className="stack">
            <div className="seg" role="radiogroup" aria-label="Rule set">
              {(Object.keys(MODES) as Mode[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={draft.mode === m}
                  className="seg__btn"
                  onClick={() => setSettings(m, draft.max, MODES[m].defaultMinutes)}
                >
                  {MODES[m].title}
                </button>
              ))}
            </div>
            <p className="muted small">{MODES[draft.mode].tagline}</p>
            <Stepper
              label="Number of players"
              value={draft.max}
              min={Math.max(MODES[draft.mode].minPlayers, players.length)}
              max={MODES[draft.mode].maxPlayers}
              onChange={(v) => setSettings(draft.mode, v, draft.minutes)}
            />
            <Stepper
              label="Investigation time"
              suffix=" min"
              value={draft.minutes}
              min={1}
              max={60}
              onChange={(v) => setSettings(draft.mode, draft.max, v)}
            />
          </div>
        ) : (
          <dl className="facts">
            <div>
              <dt>Rule set</dt>
              <dd>{cfg.title}</dd>
            </div>
            <div>
              <dt>Players</dt>
              <dd>{room.max_players}</dd>
            </div>
            <div>
              <dt>Investigation</dt>
              <dd>{room.invest_minutes} min</dd>
            </div>
          </dl>
        )}
      </section>

      <ErrorLine error={error} />

      <div className="dock">
        {isHost ? (
          <button className="btn btn--primary btn--block" disabled={!enough || busy || saving} onClick={() => run(() => api.start(session))}>
            {enough
              ? players.length < room.max_players
                ? `Begin with ${players.length} players`
                : 'Begin the game'
              : `Waiting for players (${cfg.minPlayers} minimum)`}
          </button>
        ) : (
          <p className="waiting">The host will begin the game shortly…</p>
        )}
        <button
          className="link center"
          onClick={() =>
            run(async () => {
              await api.leave(session);
              onLeave();
            })
          }
        >
          Leave room
        </button>
      </div>

      {showRules && (
        <Modal label="Rules" onClose={() => setShowRules(false)}>
          <h2 className="title title--sm">{cfg.title}</h2>
          <RulesOverview mode={room.mode} minutes={room.invest_minutes} />
        </Modal>
      )}
    </Screen>
  );
}

function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, suffix = '', disabled, onChange } = props;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper__ctl">
        <button aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite">
          {value}
          {suffix}
        </output>
        <button aria-label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
