import { describe, expect, it } from 'vitest';
import { clue, score } from './rules';

describe('clue', () => {
  it('caps addition at the extremes in full mode', () => {
    expect(clue('full', 'add', 4, 9)).toBe('3–20');
    expect(clue('full', 'add', 10, 10)).toBe('3–20');
    expect(clue('full', 'add', 10, 11)).toBe('21');
    expect(clue('full', 'add', 90, 90)).toBe('180–199');
    expect(clue('full', 'add', 89, 90)).toBe('179');
  });
  it('gives exact sums in casual mode', () => {
    expect(clue('casual', 'add', 4, 9)).toBe('13');
  });
  it('multiplies', () => expect(clue('full', 'mul', 7, 12)).toBe('84'));
  it('divides larger by smaller, floored', () => {
    expect(clue('full', 'div', 7, 50)).toBe('7');
    expect(clue('full', 'div', 50, 7)).toBe('7');
    expect(clue('full', 'div', 33, 34)).toBe('1');
  });
  it('counts zero digits', () => {
    expect(clue('full', 'zero', 100, 40)).toBe('3');
    expect(clue('full', 'zero', 11, 23)).toBe('0');
  });
});

describe('score', () => {
  const numbers = { a: 10, b: 20, c: 30 };
  it('awards own, others and secret-kept points', () => {
    const s = score({
      numbers,
      guesses: [
        { player: 'a', target: 'a', value: 10 }, // +5
        { player: 'a', target: 'b', value: 20 }, // +2, b cracked
        { player: 'b', target: 'b', value: 21 }, // -5
        { player: 'c', target: 'a', value: 99 }, // wrong, a stays secret
      ],
    });
    expect(s.a).toEqual({ own: 5, others: 2, secret: 3, total: 10 });
    expect(s.b).toEqual({ own: -5, others: 0, secret: 0, total: -5 });
    expect(s.c).toEqual({ own: 0, others: 0, secret: 3, total: 3 });
  });
});
