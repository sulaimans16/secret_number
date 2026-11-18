import { describe, expect, it } from 'vitest';
import { createPractice, finalize, share, startInvestigation, step, submitYourGuesses, visit, YOU, botBelief } from './engine';
import { score } from '../lib/rules';
import type { Difficulty } from '../lib/engine';

// small deterministic PRNG
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function play(mode: 'full' | 'casual', difficulty: Difficulty, seed: number) {
  const r = rng(seed);
  let t = 1_000_000;
  let s = createPractice({ name: 'Me', mode, bots: 4, difficulty, minutes: 2 }, 1, r, t);
  s = startInvestigation(s, t, r);
  while (s.room.status === 'investigation') {
    t += 1000;
    s = step(s, t, r);
  }
  expect(s.room.status).toBe('guessing');
  s = submitYourGuesses(s, {});
  return s;
}

describe('practice engine', () => {
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    for (const mode of ['full', 'casual'] as const) {
      it(`plays a full ${mode} game with ${d} bots`, () => {
        const s = play(mode, d, 7);
        expect(s.room.status).toBe('reveal');
        // numbers unique and in range
        const nums = Object.values(s.numbers);
        expect(new Set(nums).size).toBe(nums.length);
        // no ticket type reused on the same target
        const keys = s.visits.map((v) => `${v.from_player}>${v.to_player}:${v.ticket}`);
        expect(new Set(keys).size).toBe(keys.length);
        // bots spent most of their tickets
        const bots = s.players.filter((p) => p.id !== YOU);
        expect(bots.every((b) => Object.values(b.tickets).reduce((a, n) => a + n, 0) <= 1)).toBe(true);
        // scores match the shared scoring rules
        const sc = score({ numbers: s.numbers, guesses: s.guesses });
        for (const p of s.players) expect(p.score).toBe(sc[p.id].total);
      });
    }
  }

  it('hard bots never guess their own number wrong when sure', () => {
    for (let seed = 1; seed < 12; seed++) {
      const s = play('casual', 'hard', seed);
      for (const g of s.guesses.filter((g) => g.player === g.target && g.player !== YOU)) {
        const sure = botBelief(s, g.player, false)[g.player];
        if (sure.length === 1) expect(g.value).toBe(s.numbers[g.player]);
      }
    }
  });

  it('lets you visit and reveals the clue to both players', () => {
    const r = rng(3);
    let s = startInvestigation(createPractice({ name: 'Me', mode: 'full', bots: 3, difficulty: 'medium', minutes: 5 }, 1, r), Date.now(), r);
    const { state, result } = visit(s, YOU, 'bot1', 'add');
    expect(state.clues.at(-1)?.result).toBe(result);
    expect(() => visit(state, YOU, 'bot1', 'add')).toThrow(/already used/);
    s = share(state, 'bot1', r, YOU);
    expect(s.messages.at(-1)?.to).toBe(YOU);
    expect(s.messages.at(-1)?.claim).toBeTruthy();
    expect(finalize(s).room.status).toBe('reveal');
  });
});
