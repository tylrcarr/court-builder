// Exact build planner: one body and one archetype solved as a mixed-integer program (HiGHS, compiled to WebAssembly).
//
// A build is a multiple-choice knapsack with side rules: every attribute picks one option (a base rating plus how many
// Cap Breakers go on it, which fixes its final rating), and the picks share resources: the 99 Overall cap (one linear
// limit per archetype, because Overall is a weighted average with rating-dependent weights:
// Σ wᵢ·sᵢ(r)·r / Σ wᵢ·sᵢ(r) ≤ T  ⇔  Σ wᵢ·sᵢ(r)·(r − T) ≤ 0) and the Cap Breaker count. Badge tiers are AND/OR rules on
// final ratings, linked minimums are linear rules between base ratings, and the planned archetype is kept the build's
// player type by holding it at 99 while every other archetype stays just under. The greedy optimizer climbs one
// breakpoint at a time and can't see combinations (e.g. lower dunk + more breakers on boards to reach 95); the solver
// considers all of them and proves the best plan for its scoring.
//
// The scoring itself (what a badge tier or a rating point is worth) comes from the caller as a spec; see mipSpec in
// breakpoints.js. The solver is optional: until setMipSolver is called (the Lab's workers and the tests load HiGHS),
// everything falls back to the greedy optimizer.
import data from './rules.json' with { type: 'json' };
import { attributes, ladder, playerTypeCount } from './engine.js';

let highs = null;
export const setMipSolver = h => { highs = h; };
export const mipReady = () => !!highs;

const N = attributes.length;
// The game takes a build "filled to 99": 98.95 and up. Other archetypes stay under that so the planned one leads.
const FULL = 98.95;
const scale = (i, r) => data.scales[i][r] ?? 1;
// Overall score S ↔ weighted-average threshold T (Overall is a linear map of the weighted average).
function threshold(h, S) {
  const [[low, high], [start, end]] = data.lerp[h - 64];
  return low + (S - start) * (high - low) / (end - start);
}
const num = x => (Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(10));

// Options for attribute i: [{ v, n, f }]. Attributes valued point by point (spec.smooth) keep every base rating; others
// only the lowest base for each step of what they can unlock (spec.marks: final ratings where something changes), plus
// base ratings that linked minimums may need (spec.extraBases).
function optionsFor(i, spec, type) {
  const cap = spec.caps[i], lo = Math.max(25, spec.baseMin?.[i] ?? 25), out = [];
  const minF = spec.minimums[i] ?? 25, maxF = Math.min(cap, spec.maximums?.[i] ?? 99);
  const finalOf = (v, n) => v + ladder(i, v, cap, spec.h, type).slice(0, n).reduce((s, g) => s + g, 0);
  const marks = spec.smooth.has(i) ? null : [...new Set([minF, ...(spec.marks[i] ?? [])])].sort((a, b) => a - b);
  const extra = spec.extraBases?.[i] ?? new Set();
  const nMax = spec.noBreakers?.has(i) ? 0 : 5;
  for (let n = 0; n <= nMax; n++) {
    let lastClass = null;
    for (let v = lo; v <= cap; v++) {
      if (n > 0 && ladder(i, v, cap, spec.h, type)[n - 1] <= 0) continue; // a breaker that adds nothing
      const f = finalOf(v, n);
      if (f < minF || f > maxF) continue;
      // Neighborhood (local branching around a known build): finals within ±radius of it, Cap Breakers within ±2.
      if (spec.near && (Math.abs(f - spec.near.final[i]) > spec.near.radius || Math.abs(n - spec.near.breakers[i]) > 2)) continue;
      if (marks) {
        // Step class: how many marks this final rating reaches. Keep the lowest base per class (cheapest).
        const cls = marks.filter(m => f >= m).length;
        if (cls === lastClass && !extra.has(v)) continue;
        lastClass = cls;
      }
      out.push({ v, n, f });
    }
  }
  return out;
}

// spec: { h, type, caps, minimums, maximums, baseMin, general, specialCount, eligible:Set, smooth:Set, marks:{i:[ratings]},
//   attrValue:(i,f)=>number, goals:[{ must:rank, tiers:[{ alts:[[[i,m],…],…], plain, gates:[{ attr, fn, worth }] }] }],
//   links:[[s,t,δ]] }
// A gate scales part of a tier's worth by fn(final rating of attr), e.g. driving badges by speed with ball.
// Returns { base, breakers, final, objective, status } or null (infeasible / no solver).
export function solvePlan(spec, { timeLimit = 4, full = true } = {}) {
  if (!highs) return null;
  const { h, type } = spec;
  // Linked minimums: a target may need base ratings the step classes skip (source − δ). Two passes cover chains.
  spec.extraBases = {};
  let opts = attributes.map((_, i) => optionsFor(i, spec, type));
  for (let pass = 0; pass < 2; pass++) {
    for (const [s, t, d] of spec.links) for (const o of opts[s]) {
      const need = Math.min(spec.caps[t], o.v - d);
      if (need > 25) (spec.extraBases[t] ??= new Set()).add(need);
    }
    opts = attributes.map((_, i) => optionsFor(i, spec, type));
  }
  if (opts.some(o => !o.length)) return null;
  const z = (i, k) => `z${i}_${k}`;
  const rows = [], bins = [], obj = [];
  const term = (c, name) => (c >= 0 ? ' + ' : ' - ') + num(Math.abs(c)) + ' ' + name;
  const line = parts => parts.join('') || ' 0 z0_0';
  opts.forEach((list, i) => list.forEach((o, k) => {
    bins.push(z(i, k));
    const c = spec.attrValue(i, o.f);
    if (c) obj.push(term(c, z(i, k)));
  }));
  // One option per attribute.
  opts.forEach((list, i) => rows.push(`a${i}:` + line(list.map((_, k) => term(1, z(i, k)))) + ' = 1'));
  // Overall: every archetype ≤ 99 (others under FULL), the planned one ≥ FULL.
  const types = playerTypeCount(h);
  const tHi = threshold(h, 99), tFull = threshold(h, FULL);
  for (let j = 0; j < types; j++) {
    const w = data.weights[h][j];
    const T = full && j !== type ? tFull : tHi;
    const lhs = opts.flatMap((list, i) => list.map((o, k) => term(w[i] * scale(i, o.v) * (o.v - T), z(i, k))));
    rows.push(`o${j}:` + line(lhs) + ' <= 0');
    if (full && j === type)
      rows.push(`f${j}:` + line(opts.flatMap((list, i) => list.map((o, k) => term(w[i] * scale(i, o.v) * (o.v - tFull), z(i, k))))) + ' >= 0');
  }
  // Cap Breakers: specialized ones only on eligible attributes.
  const breakerTerms = elig => opts.flatMap((list, i) => elig(i) ? list.map((o, k) => o.n ? term(o.n, z(i, k)) : '').filter(Boolean) : []);
  rows.push('b0:' + line(breakerTerms(() => true)) + ` <= ${spec.general + spec.specialCount}`);
  if (spec.specialCount) rows.push('b1:' + line(breakerTerms(i => !spec.eligible.has(i))) + ` <= ${spec.general}`);
  // Linked minimums on base ratings: base[t] ≥ min(cap[t], base[s] − δ). Skipped when no pair of options can break it.
  spec.links.forEach(([s, t, d], n) => {
    const lowT = Math.min(...opts[t].map(o => o.v)), highS = Math.max(...opts[s].map(o => Math.min(spec.caps[t], o.v - d)));
    if (highS <= lowT) return;
    rows.push(`l${n}:` + line([...opts[t].map((o, k) => term(o.v, z(t, k))), ...opts[s].map((o, k) => term(-Math.min(spec.caps[t], o.v - d), z(s, k)))]) + ' >= 0');
  });
  // Badge tiers.
  const reach = (i, m) => opts[i].map((o, k) => o.f >= m ? k : -1).filter(k => k >= 0);
  const always = (i, m) => opts[i].every(o => o.f >= m);
  const gateTerms = (g, c) => opts[g.attr].map((o, k) => term(-c * g.fn(o.f), z(g.attr, k)));
  spec.goals.forEach((g, gi) => {
    let prev = null;
    for (let k = 0; k < g.tiers.length; k++) {
      const tier = g.tiers[k];
      const alts = tier.alts.filter(alt => alt.every(([i, m]) => reach(i, m).length));
      if (!alts.length) { if (g.must > k) return void rows.push(`m${gi}: 0 z0_0 >= 1`); break; }
      const y = `y${gi}_${k}`;
      bins.push(y);
      if (prev) rows.push(`n${gi}_${k}: ${y} - ${prev} <= 0`);
      if (g.must > k) rows.push(`m${gi}_${k}: ${y} >= 1`);
      if (alts.some(alt => alt.every(([i, m]) => always(i, m)))) { /* always met */ }
      else {
        const us = alts.map((alt, a) => {
          const u = alts.length === 1 ? y : `u${gi}_${k}_${a}`;
          if (u !== y) bins.push(u);
          alt.forEach(([i, m], r) => { if (!always(i, m)) rows.push(`r${gi}_${k}_${a}_${r}: ${u}` + line(reach(i, m).map(kk => term(-1, z(i, kk)))) + ' <= 0'); });
          return u;
        });
        if (alts.length > 1) rows.push(`t${gi}_${k}: ${y}` + line(us.map(u => term(-1, u))) + ' <= 0');
      }
      if (tier.plain) obj.push(term(tier.plain, y));
      (tier.gates ?? []).forEach((g, gk) => {
        // worth × fn(attr), linearized: p ≤ worth·y and p ≤ worth·fn (y is 0/1, fn in [0, 1]).
        const p = `p${gi}_${k}_${gk}`;
        obj.push(term(1, p));
        rows.push(`q${gi}_${k}_${gk}: ${p} - ${num(g.worth)} ${y} <= 0`);
        rows.push(`s${gi}_${k}_${gk}: ${p}` + gateTerms(g, g.worth).join('') + ' <= 0');
      });
      prev = y;
    }
  });
  const lp = ['Maximize', ' obj:' + line(obj), 'Subject To', ...rows.map(r => ' ' + r), 'Binary', ' ' + bins.join(' '), 'End'].join('\n');
  let sol;
  try { sol = highs.solve(lp, { time_limit: timeLimit, mip_rel_gap: 1e-6, output_flag: false }); } catch (e) { return { error: e.message }; }
  if (!sol.Columns || !/Optimal|limit/i.test(sol.Status) || !Number.isFinite(sol.ObjectiveValue)) return { status: sol.Status };
  const pick = opts.map((list, i) => list[list.findIndex((_, k) => (sol.Columns[z(i, k)]?.Primal ?? 0) > 0.5)]);
  if (pick.some(o => !o)) return { status: 'no pick' };
  return { base: pick.map(o => o.v), breakers: pick.map(o => o.n), final: pick.map(o => o.f), objective: sol.ObjectiveValue,
    status: sol.Status, size: { vars: bins.length, rows: rows.length } };
}
