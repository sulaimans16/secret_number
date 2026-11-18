import { clue, MODES, type Mode, type Ticket } from '../lib/rules';

/** A known (or claimed) fact: combining a's and b's numbers with `ticket` gave `result`. */
export interface Fact {
  a: string;
  b: string;
  ticket: Ticket;
  result: string;
}

export type Domains = Record<string, number[]>;

/**
 * Narrow each player's possible numbers using the given facts.
 * Arc-consistency over every fact, plus "all numbers are different" for solved players,
 * repeated until nothing changes. An empty list means the facts contradict each other.
 */
export function candidates(facts: Fact[], playerIds: string[], mode: Mode): Domains {
  const max = MODES[mode].maxNumber;
  const dom: Record<string, Set<number>> = {};
  for (const id of playerIds) dom[id] = new Set(Array.from({ length: max }, (_, i) => i + 1));

  const revise = (x: string, y: string, t: Ticket, r: string) => {
    let changed = false;
    for (const vx of dom[x]) {
      let ok = false;
      for (const vy of dom[y]) {
        if (vy !== vx && clue(mode, t, vx, vy) === r) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        dom[x].delete(vx);
        changed = true;
      }
    }
    return changed;
  };

  const usable = facts.filter((f) => dom[f.a] && dom[f.b] && f.a !== f.b);
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (const f of usable) {
      if (revise(f.a, f.b, f.ticket, f.result)) changed = true;
      if (revise(f.b, f.a, f.ticket, f.result)) changed = true;
    }
    for (const id of playerIds) {
      if (dom[id].size !== 1) continue;
      const [v] = dom[id];
      for (const other of playerIds) {
        if (other !== id && dom[other].delete(v)) changed = true;
      }
    }
    if (!changed) break;
  }
  exactPass(usable, playerIds, dom, mode);
  return Object.fromEntries(playerIds.map((id) => [id, [...dom[id]].sort((p, q) => p - q)]));
}

/**
 * Arc consistency misses deductions that need several facts at once (e.g. three pairwise sums).
 * For each group of players linked by facts, enumerate every consistent assignment and keep only
 * values that appear in one. Bails out (keeping the arc-consistent result) if the search is too big.
 */
function exactPass(facts: Fact[], ids: string[], dom: Record<string, Set<number>>, mode: Mode, budget = 120_000) {
  const linked = new Map<string, Fact[]>();
  for (const f of facts) {
    linked.set(f.a, [...(linked.get(f.a) ?? []), f]);
    linked.set(f.b, [...(linked.get(f.b) ?? []), f]);
  }
  const seen = new Set<string>();
  for (const start of ids) {
    if (seen.has(start) || !linked.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const f of linked.get(x) ?? []) {
        for (const y of [f.a, f.b]) if (!seen.has(y)) (seen.add(y), stack.push(y));
      }
    }
    if (comp.length < 3) continue; // pairs are already exact after arc consistency
    comp.sort((p, q) => dom[p].size - dom[q].size);
    const support: Record<string, Set<number>> = Object.fromEntries(comp.map((c) => [c, new Set<number>()]));
    const val: Record<string, number> = {};
    const used = new Set<number>();
    let steps = 0;
    let aborted = false;
    const ok = (x: string) =>
      (linked.get(x) ?? []).every((f) => {
        const o = f.a === x ? f.b : f.a;
        return !(o in val) || clue(mode, f.ticket, val[x], val[o]) === f.result;
      });
    const go = (i: number) => {
      if (aborted) return;
      if (i === comp.length) {
        for (const c of comp) support[c].add(val[c]);
        return;
      }
      const x = comp[i];
      for (const v of dom[x]) {
        if (++steps > budget) return void (aborted = true);
        if (used.has(v)) continue;
        val[x] = v;
        if (ok(x)) {
          used.add(v);
          go(i + 1);
          used.delete(v);
        }
        delete val[x];
      }
    };
    go(0);
    if (aborted) continue;
    for (const c of comp) dom[c] = support[c];
  }
}

export const contradicts = (d: Domains) => Object.values(d).some((v) => v.length === 0);
