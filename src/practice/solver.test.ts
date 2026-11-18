import { describe, expect, it } from 'vitest';
import { candidates, contradicts } from './solver';
import { clue } from '../lib/rules';

describe('solver', () => {
  it('narrows with a single product clue', () => {
    const d = candidates([{ a: 'x', b: 'y', ticket: 'mul', result: '91' }], ['x', 'y'], 'full');
    expect(d.x).toEqual([1, 7, 13, 91]);
  });

  it('solves a chained casual puzzle', () => {
    const n = { a: 3, b: 11, c: 26 };
    const f = (p: 'a' | 'b' | 'c', q: 'a' | 'b' | 'c') => ({ a: p, b: q, ticket: 'add' as const, result: clue('casual', 'add', n[p], n[q]) });
    const d = candidates([f('a', 'b'), f('b', 'c'), f('a', 'c')], ['a', 'b', 'c'], 'casual');
    expect(d).toEqual({ a: [3], b: [11], c: [26] });
  });

  it('handles capped addition ranges', () => {
    const d = candidates([{ a: 'x', b: 'y', ticket: 'add', result: '180–199' }], ['x', 'y'], 'full');
    expect(Math.min(...d.x)).toBe(80);
    expect(d.x).not.toContain(79);
  });

  it('applies all-different to solved players', () => {
    const d = candidates(
      [
        { a: 'x', b: 'y', ticket: 'mul', result: '2' }, // {1,2}
        { a: 'x', b: 'z', ticket: 'zero', result: '1' },
      ],
      ['x', 'y', 'z'],
      'full',
    );
    expect(d.x).toEqual([1, 2]);
    expect(d.y).toEqual([1, 2]);
  });

  it('flags contradictions', () => {
    const d = candidates(
      [
        { a: 'x', b: 'y', ticket: 'add', result: '5' },
        { a: 'x', b: 'y', ticket: 'mul', result: '100' },
      ],
      ['x', 'y'],
      'casual',
    );
    expect(contradicts(d)).toBe(true);
  });
});
