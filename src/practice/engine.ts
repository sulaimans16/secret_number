// Single-player practice: a pure, client-side version of the game with bot opponents.
import type { Clue, Player, Room, Visit } from '../lib/api';
import type { ChatMessage, Difficulty } from '../lib/engine';
import { MODES, TICKETS, clue, score, type Mode, type Ticket } from '../lib/rules';
import { candidates, contradicts, type Fact } from './solver';

export const YOU = 'you';
const BOT_NAMES = ['Vex', 'Morrow', 'Nyx', 'Crane', 'Silas', 'Wren', 'Corvin', 'Hex', 'Rook', 'Lark', 'Ash'];

export interface PracticeSettings {
  name: string;
  mode: Mode;
  bots: number;
  difficulty: Difficulty;
  minutes: number;
}

export interface PracticeState {
  settings: PracticeSettings;
  room: Room;
  players: Player[];
  numbers: Record<string, number>;
  visits: Visit[];
  clues: Clue[]; // every clue in the game
  messages: ChatMessage[];
  guesses: { player: string; target: string; value: number }[];
  nextBotAt: Record<string, number>; // epoch ms
  heard: Record<string, Fact[]>; // claims each bot has heard (and chosen to keep)
  seq: number;
}

type Rng = () => number;
const pick = <T,>(xs: T[], r: Rng) => xs[Math.floor(r() * xs.length)];
const iso = (ms: number) => new Date(ms).toISOString();

export function createPractice(s: PracticeSettings, round = 1, r: Rng = Math.random, now = Date.now()): PracticeState {
  const cfg = MODES[s.mode];
  const n = s.bots + 1;
  const pool = Array.from({ length: cfg.maxNumber }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const names = [...BOT_NAMES].sort(() => r() - 0.5).slice(0, s.bots);
  const ids = [YOU, ...names.map((_, i) => `bot${i + 1}`)];
  const players: Player[] = ids.map((id, i) => ({
    id,
    room_id: 'practice',
    name: i === 0 ? s.name || 'You' : names[i - 1],
    seat: i + 1,
    tickets: { ...cfg.tickets } as Record<string, number>,
    ready: i !== 0,
    guessed: false,
    score: 0,
    own_points: 0,
    guess_points: 0,
    secret_bonus: 0,
    revealed_number: null,
  }));
  return {
    settings: s,
    room: {
      id: `practice-${now}`,
      code: 'SOLO',
      host_player: YOU,
      mode: s.mode,
      max_players: n,
      invest_minutes: s.minutes,
      status: 'briefing',
      phase_ends_at: null,
      round,
    },
    players,
    numbers: Object.fromEntries(ids.map((id, i) => [id, pool[i]])),
    visits: [],
    clues: [],
    messages: [],
    guesses: [],
    nextBotAt: {},
    heard: Object.fromEntries(ids.slice(1).map((id) => [id, []])),
    seq: 1,
  };
}

const ids = (s: PracticeState) => s.players.map((p) => p.id);
const nameOf = (s: PracticeState, id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
export const factOf = (c: Clue): Fact => ({ a: c.from_player, b: c.to_player, ticket: c.ticket, result: c.result });
const ownFacts = (s: PracticeState, id: string) => s.clues.filter((c) => c.from_player === id || c.to_player === id).map(factOf);

/** Average gap between a bot's actions so its tickets last the whole investigation. */
function botGap(s: PracticeState) {
  const tickets = Object.values(MODES[s.settings.mode].tickets).reduce((a, b) => a + (b ?? 0), 0);
  return (s.settings.minutes * 60_000) / (tickets + 2);
}

export function startInvestigation(s: PracticeState, now = Date.now(), r: Rng = Math.random): PracticeState {
  const gap = botGap(s);
  return {
    ...s,
    room: { ...s.room, status: 'investigation', phase_ends_at: iso(now + s.settings.minutes * 60_000) },
    players: s.players.map((p) => ({ ...p, ready: true })),
    nextBotAt: Object.fromEntries(ids(s).slice(1).map((id) => [id, now + gap * (0.3 + r() * 0.9)])),
  };
}

export function visit(s: PracticeState, from: string, to: string, t: Ticket, now = Date.now()): { state: PracticeState; result: string } {
  if (s.room.status !== 'investigation') throw new Error('Investigation is closed');
  if (from === to) throw new Error('You cannot visit yourself');
  const p = s.players.find((x) => x.id === from)!;
  if ((p.tickets[t] ?? 0) <= 0) throw new Error(`No ${TICKETS[t].name} tickets left`);
  if (s.visits.some((v) => v.from_player === from && v.to_player === to && v.ticket === t))
    throw new Error('You already used that ticket on this player');
  const result = clue(s.room.mode, t, s.numbers[from], s.numbers[to]);
  const id = s.seq;
  const v: Visit = { id, room_id: s.room.id, from_player: from, to_player: to, ticket: t, created_at: iso(now) };
  const c: Clue = { visit_id: id, from_player: from, to_player: to, ticket: t, result, created_at: iso(now) };
  return {
    result,
    state: {
      ...s,
      seq: id + 1,
      visits: [...s.visits, v],
      clues: [...s.clues, c],
      players: s.players.map((x) => (x.id === from ? { ...x, tickets: { ...x.tickets, [t]: x.tickets[t] - 1 } } : x)),
    },
  };
}

function say(s: PracticeState, from: string, text: string, claim?: ChatMessage['claim'], to?: string, now = Date.now()): PracticeState {
  const m: ChatMessage = { id: s.seq, from, to, text, claim, at: iso(now) };
  return { ...s, seq: s.seq + 1, messages: [...s.messages, m] };
}

/** Make up a believable wrong result for a fact. */
function fib(mode: Mode, f: Fact, r: Rng): string {
  if (f.result.includes('–')) return f.result;
  const n = Number(f.result);
  const delta = (1 + Math.floor(r() * (f.ticket === 'mul' ? 40 : f.ticket === 'add' ? 9 : 2))) * (r() < 0.5 ? -1 : 1);
  let v = Math.max(f.ticket === 'zero' ? 0 : 1, n + delta);
  if (v === n) v = n + 1;
  if (f.ticket === 'add' && mode === 'full' && (v <= 20 || v >= 180)) v = n + (n < 100 ? 2 : -2);
  return String(v);
}

function claimText(s: PracticeState, speaker: string, f: Fact, result: string) {
  const other = f.a === speaker ? f.b : f.a;
  const who = other === YOU ? 'you' : nameOf(s, other);
  return `${who === 'you' ? 'You' : who} and I got ${TICKETS[f.ticket].symbol} ${result}.`;
}

/** Bot shares one of its clues publicly (or privately to `to`). Hard bots sometimes lie. */
export function share(s: PracticeState, bot: string, r: Rng = Math.random, to?: string, now = Date.now()): PracticeState {
  const mine = ownFacts(s, bot);
  if (mine.length === 0) {
    return say(s, bot, to ? 'I have nothing for you yet.' : pick(['Patience.', 'Nobody has come to my room yet.', 'I am listening.'], r), undefined, to, now);
  }
  const f = pick(mine, r);
  const lieRate = s.settings.difficulty === 'hard' ? 0.25 : 0;
  const lie = r() < lieRate;
  const result = lie ? fib(s.room.mode, f, r) : f.result;
  const next = say(s, bot, claimText(s, bot, f, result), { ...f, result, lie }, to, now);
  if (to) return next;
  // other bots hear public claims
  const heard = { ...next.heard };
  for (const b of Object.keys(heard)) {
    if (b === bot || s.settings.difficulty === 'easy') continue;
    const claim: Fact = { ...f, result };
    if (s.settings.difficulty === 'hard') {
      // keep only claims consistent with what this bot already knows first-hand
      const test = candidates([...ownFacts(next, b), ...heard[b], claim], ids(next), next.room.mode);
      if (contradicts(test)) continue;
    }
    heard[b] = [...heard[b], claim];
  }
  return { ...next, heard };
}

/** What a bot believes about everyone's numbers. */
export function botBelief(s: PracticeState, bot: string, withHeard = true) {
  return candidates([...ownFacts(s, bot), ...(withHeard ? s.heard[bot] ?? [] : [])], ids(s), s.room.mode);
}

/** Rough information value of a ticket on a target: number of distinct results over sampled pairs. */
function ticketValue(s: PracticeState, bot: string, target: string, t: Ticket, belief: Record<string, number[]>, r: Rng) {
  const xs = belief[bot];
  const ys = belief[target];
  const seen = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const x = pick(xs, r);
    const y = pick(ys, r);
    if (x !== y) seen.add(clue(s.room.mode, t, x, y));
  }
  return seen.size;
}

/** One bot action during investigation: visit someone and maybe talk. */
export function botTurn(s: PracticeState, bot: string, r: Rng = Math.random, now = Date.now()): PracticeState {
  const d = s.settings.difficulty;
  const me = s.players.find((p) => p.id === bot)!;
  let next = s;
  const avail = Object.entries(me.tickets).filter(([, n]) => n > 0).map(([t]) => t as Ticket);
  const options: [string, Ticket][] = [];
  for (const p of s.players) {
    if (p.id === bot) continue;
    for (const t of avail) if (!s.visits.some((v) => v.from_player === bot && v.to_player === p.id && v.ticket === t)) options.push([p.id, t]);
  }
  if (options.length) {
    let choice: [string, Ticket];
    if (d === 'easy') choice = pick(options, r);
    else {
      const belief = botBelief(s, bot);
      // prefer targets we know least about, then the most informative ticket
      let best = -1;
      choice = options[0];
      for (const o of options) {
        const v = (belief[o[0]].length / MODES[s.room.mode].maxNumber) * 3 + ticketValue(s, bot, o[0], o[1], belief, r) / 20 + r() * 0.5;
        if (v > best) (best = v), (choice = o);
      }
    }
    next = visit(next, bot, choice[0], choice[1], now).state;
  }
  const talk = d === 'easy' ? 0.1 : d === 'medium' ? 0.4 : 0.5;
  if (r() < talk) next = share(next, bot, r, undefined, now);
  const gap = botGap(s);
  return { ...next, nextBotAt: { ...next.nextBotAt, [bot]: now + gap * (0.5 + r()) } };
}

/** Run any bots whose turn has come; advance phases when their deadline passes. */
export function step(s: PracticeState, now = Date.now(), r: Rng = Math.random): PracticeState {
  let next = s;
  if (next.room.status === 'investigation') {
    for (const [bot, at] of Object.entries(next.nextBotAt)) if (now >= at) next = botTurn(next, bot, r, now);
    if (now >= Date.parse(next.room.phase_ends_at!)) next = startGuessing(next, now, r);
  } else if (next.room.status === 'guessing' && now >= Date.parse(next.room.phase_ends_at!)) {
    next = finalize(next);
  }
  return next;
}

function botGuesses(s: PracticeState, bot: string, r: Rng) {
  const d = s.settings.difficulty;
  const sure = botBelief(s, bot, false);
  const belief = botBelief(s, bot, true);
  const out: { player: string; target: string; value: number }[] = [];
  const own = sure[bot].length === 1 ? sure[bot] : belief[bot].length ? belief[bot] : sure[bot];
  const guessOwn =
    d === 'hard' ? sure[bot].length === 1 || (own.length === 1 && r() < 0.6) : d === 'medium' ? own.length <= 2 : r() < 0.5;
  if (guessOwn && own.length) out.push({ player: bot, target: bot, value: pick(own, r) });
  for (const p of s.players) {
    if (p.id === bot) continue;
    const c = belief[p.id].length ? belief[p.id] : sure[p.id];
    if (c.length === 1) out.push({ player: bot, target: p.id, value: c[0] });
    else if (d === 'easy' && r() < 0.3 && c.length) out.push({ player: bot, target: p.id, value: pick(c, r) });
    else if (d !== 'easy' && c.length === 2 && r() < 0.35) out.push({ player: bot, target: p.id, value: pick(c, r) });
  }
  return out;
}

export function startGuessing(s: PracticeState, now = Date.now(), r: Rng = Math.random): PracticeState {
  const bots = ids(s).slice(1);
  const guesses = [...s.guesses.filter((g) => g.player === YOU), ...bots.flatMap((b) => botGuesses(s, b, r))];
  return {
    ...s,
    guesses,
    room: { ...s.room, status: 'guessing', phase_ends_at: iso(now + MODES[s.room.mode].guessMinutes * 60_000) },
    players: s.players.map((p) => ({ ...p, guessed: p.id !== YOU })),
  };
}

export function submitYourGuesses(s: PracticeState, g: Record<string, number>): PracticeState {
  if (s.room.status !== 'guessing') throw new Error('Guessing is closed');
  const max = MODES[s.room.mode].maxNumber;
  const mine = Object.entries(g)
    .filter(([id, v]) => ids(s).includes(id) && Number.isInteger(v) && v >= 1 && v <= max)
    .map(([target, value]) => ({ player: YOU, target, value }));
  return finalize({ ...s, guesses: [...s.guesses.filter((x) => x.player !== YOU), ...mine] });
}

export function finalize(s: PracticeState): PracticeState {
  const sc = score({ numbers: s.numbers, guesses: s.guesses });
  return {
    ...s,
    room: { ...s.room, status: 'reveal', phase_ends_at: null },
    players: s.players.map((p) => ({
      ...p,
      guessed: true,
      own_points: sc[p.id].own,
      guess_points: sc[p.id].others,
      secret_bonus: sc[p.id].secret,
      score: sc[p.id].total,
      revealed_number: s.numbers[p.id],
    })),
  };
}

/** What the human player is allowed to see. */
export function yourClues(s: PracticeState) {
  return s.clues.filter((c) => c.from_player === YOU || c.to_player === YOU);
}
export function yourMessages(s: PracticeState) {
  return s.messages.filter((m) => !m.to || m.to === YOU);
}
