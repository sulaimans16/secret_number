// Game configuration and pure rule functions.
// The authoritative versions run in Postgres (supabase/migrations/0001_init.sql);
// these mirror them for the UI, the rules briefing and unit tests.

export type Mode = 'full' | 'casual';
export type Ticket = 'add' | 'mul' | 'div' | 'zero';

export interface ModeConfig {
  id: Mode;
  title: string;
  tagline: string;
  maxNumber: number;
  minPlayers: number;
  maxPlayers: number;
  defaultMinutes: number;
  guessMinutes: number;
  tickets: Partial<Record<Ticket, number>>;
}

export const MODES: Record<Mode, ModeConfig> = {
  full: {
    id: 'full',
    title: 'Devil’s Rules',
    tagline: 'The full game. Numbers 1–100. Four kinds of tickets.',
    maxNumber: 100,
    minPlayers: 4,
    maxPlayers: 12,
    defaultMinutes: 15,
    guessMinutes: 3,
    tickets: { add: 3, mul: 2, div: 2, zero: 1 },
  },
  casual: {
    id: 'casual',
    title: 'Casual',
    tagline: 'A quick round. Numbers 1–30. Addition only.',
    maxNumber: 30,
    minPlayers: 3,
    maxPlayers: 8,
    defaultMinutes: 5,
    guessMinutes: 3,
    tickets: { add: 4 },
  },
};

export const TICKETS: Record<Ticket, { name: string; symbol: string; describe: (m: Mode) => string }> = {
  add: {
    name: 'Addition',
    symbol: '+',
    describe: (m) =>
      m === 'full'
        ? 'Reveals the sum of both numbers. Sums of 20 or less show as “3–20”, and sums of 180 or more show as “180–199”.'
        : 'Reveals the exact sum of both numbers.',
  },
  mul: { name: 'Multiplication', symbol: '×', describe: () => 'Reveals the product of both numbers.' },
  div: {
    name: 'Division',
    symbol: '÷',
    describe: () => 'Divides the larger number by the smaller and reveals the whole-number part, with no remainder.',
  },
  zero: { name: 'Zero', symbol: '0', describe: () => 'Reveals how many 0 digits appear in the two numbers.' },
};

export const SCORING = { ownRight: 5, ownWrong: -5, otherRight: 2, secretKept: 3 };

export function clue(mode: Mode, ticket: Ticket, a: number, b: number): string {
  switch (ticket) {
    case 'add': {
      const s = a + b;
      if (mode === 'full' && s <= 20) return '3–20';
      if (mode === 'full' && s >= 180) return '180–199';
      return String(s);
    }
    case 'mul':
      return String(a * b);
    case 'div':
      return String(Math.floor(Math.max(a, b) / Math.min(a, b)));
    case 'zero':
      return String((`${a}${b}`.match(/0/g) ?? []).length);
  }
}

export interface ScoreInput {
  numbers: Record<string, number>; // playerId -> secret number
  guesses: { player: string; target: string; value: number }[];
}

export function score({ numbers, guesses }: ScoreInput) {
  const out: Record<string, { own: number; others: number; secret: number; total: number }> = {};
  for (const id of Object.keys(numbers)) {
    const ownGuess = guesses.find((g) => g.player === id && g.target === id);
    const own = ownGuess ? (ownGuess.value === numbers[id] ? SCORING.ownRight : SCORING.ownWrong) : 0;
    const others =
      SCORING.otherRight *
      guesses.filter((g) => g.player === id && g.target !== id && numbers[g.target] === g.value).length;
    const cracked = guesses.some((g) => g.target === id && g.player !== id && g.value === numbers[id]);
    const secret = cracked ? 0 : SCORING.secretKept;
    out[id] = { own, others, secret, total: own + others + secret };
  }
  return out;
}

export function ticketList(t: Record<string, number> | null | undefined): [Ticket, number][] {
  const order: Ticket[] = ['add', 'mul', 'div', 'zero'];
  return order.filter((k) => t && k in t).map((k) => [k, t![k]]);
}
