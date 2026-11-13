// Breakpoint-first build optimization.
//
// Most of a good build's Overall budget should sit exactly on badge breakpoints: a rating one point above
// the last tier it unlocks buys nothing. A few attributes are worth raising for their own sake (ball
// handle, speed, agility…) — those are "continuous". This module finds breakpoints, measures dead
// weight, and optimizes a body badge-first: must-have tiers, then the best badge value per Overall point,
// then continuous attributes with whatever is left.
import { alternatives, attributes, badges, badgeTier, capsFor, defaultBody, empty, inHeight, ladder, linksFor, mergeFloors, overall,
  playerTypeCount, positions, tiers, typeWeights } from './engine.js';
import { mipReady, solvePlan } from './mip.js';
import { clampLinks, fill, finalsFor, satisfy, satisfyAs, tierRank } from './solver.js';
import { animations, isAnimation } from './animations.js';
import { FRAME_META, ATTR_META_RATE, DRIVE_ATTRS, META_RATE, attrMetaFor, driveFactor, dunkFactor, dunkGate, finishGate, dunklessGate, oboardGate, gatedTierWorth, heightMeta, metaCap, strengthFree, reboundGate, shootingGate, metaGroup, metaOf, metaTierWorth } from './meta.js';

// Everything a build can aim for: badges plus animation unlocks (same shape, one tier).
export const goals = [...badges, ...animations];

const N = attributes.length;
export const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));

// ---------------------------------------------------------------- specialization

// Cap Breaker specialization: at most two specialized breakers, and a category may require minimum ratings
// before it can be picked. Only the shooting minimums are confirmed so far; add others here as they are.
export const MAX_SPECIALIZED = 2;
export const SPECIALIZATIONS = {
  shooting: { minimums: { mid_range: 60, three_point: 60 } },
};

export function specMinimums(category) {
  const floors = empty();
  for (const [key, min] of Object.entries(SPECIALIZATIONS[category]?.minimums ?? {})) floors[idx[key]] = min;
  return floors;
}

// Specialization requirements are checked on base ratings (before any Cap Breaker).
export function specUnlocked(category, base) {
  return !category || specMinimums(category).every((min, i) => base[i] >= min);
}

// ---------------------------------------------------------------- preferences

// prefs: { values: {name: importance, '*': default}, caps: {name: max tier rank worth paying for},
//   continuous: [attribute names], continuousWeights: {name: w}, minimums: {name: final rating} }
export const IMPORTANCE = [[0, "Don't care"], [0.5, 'Minor'], [1, 'Normal'], [2, 'Key'], [3, 'Core']];
export const DEFAULT_CONTINUOUS = ['ball_handle', 'speed', 'agility'];
// Leftover budget never pushes a base rating past 94 (94 + five +1 breakers = 99). Badge breakpoints above 94 are
// still bought when they're worth it, and the solver prefers breakers for expensive high ratings anyway.
export const BASE_CEILING = 94;
// Blank slate: nothing is valued until you choose it (or pick a preset). Aerial Wizard is capped at gold
// everywhere: +1 driving dunk for HoF on a lob badge isn't worth it.
export const defaultPrefs = () => ({
  values: { '*': 0 }, caps: {},
  continuous: [], continuousWeights: {}, minimums: {}, maximums: {},
});
// Attributes that matter beyond their breakpoints for a given build: a driving finisher (dunks or layups) needs handle
// and speed with ball to get to the rim. Added to prefs.continuous unless listed in prefs.notFeel. (Rebounding stays
// breakpoint-only: use minimums such as 87–95 defensive rebound instead.)
export const drivesToRim = final => final[idx.driving_dunk] >= 80 || final[idx.driving_layup] >= 80;
export function autoFeel(position, final) {
  return drivesToRim(final) ? ['speed_with_ball', 'ball_handle', 'speed'] : [];
}
export function feelFor(prefs, position, final) {
  const off = new Set(prefs.notFeel ?? []);
  return [...new Set([...prefs.continuous, ...autoFeel(position, final)])].filter(k => !off.has(k) || prefs.continuous.includes(k));
}

// Importance of a badge/animation. Animations default to "don't care" unless chosen.
export const valueOf = (prefs, goal) => prefs?.values?.[goal.name] ?? (isAnimation(goal) ? 0 : prefs?.values?.['*'] ?? 1);
// Highest tier rank still worth paying for (4 = Hall of Fame).
export const capOf = (prefs, goal) => prefs?.caps?.[goal.name] ?? 4;
const worthRank = (prefs, goal, rank) => Math.min(rank, capOf(prefs, goal));

// Continuous attributes compete with badges: at weight 1, ten rating points are worth one badge tier of a
// Normal badge.
export const CONTINUOUS_RATE = 0.1;
export const CONTINUOUS_WEIGHTS = [[0.5, 'Low'], [1, 'Normal'], [2, 'High'], [3, 'Max']];
// Feel terms for a set of final ratings: the user's list plus automatic driving feel (handle, speed with ball)
// once driving dunk or driving layup reaches 80, so a driving finisher can't leave itself unable to drive.
// Each term is [attribute, weight per point, target]: full weight up to the target, a quarter past it. Your own feel
// attributes are linear (target 99); attribute meta (speed, agility… by position) fills in the ones you didn't set.
function continuousTerms(opts, final = null) {
  const cw = opts.continuousWeights ?? {};
  const names = final ? feelFor({ continuous: opts.continuous ?? [], notFeel: opts.notFeel }, '', final) : (opts.continuous ?? []);
  const terms = names.map(k => typeof k === 'number' ? k : idx[k]).map(i => [i, (cw[attributes[i].name] ?? 1) * CONTINUOUS_RATE, 99]);
  const rate = metaRate(opts);
  if (rate > 0) for (const [name, [w, target, floor = 0, ceiling = 99, hit = 0]] of Object.entries(attrMetaFor(opts.position, opts.height, final))) {
    const i = idx[name];
    if (terms.some(t => t[0] === i) || (opts.notFeel ?? []).includes(name)) continue;
    terms.push([i, w * ATTR_META_RATE * rate * CONTINUOUS_RATE, target, floor, ceiling, hit]);
  }
  return terms;
}
// hit (optional): a one-off bonus, in rating points, for reaching the target — a cliff like a badge breakpoint (90
// defensive rebound on a big), so the last point to it isn't worth the same as any other.
const termValue = (w, target, f, floor = 0, ceiling = 99, hit = 0) => w * (Math.min(f, target) + 0.25 * Math.max(0, Math.min(f, ceiling) - target)
  + 2 * Math.min(f, floor) + (f >= target ? hit : 0));
const metaRate = opts => opts?.meta === false ? 0 : (opts?.metaRate ?? 1);
export function objective(final, height, opts) {
  let v = badgeValue(final, height, opts);
  for (const [i, w, target, floor, ceiling, hit] of continuousTerms(opts, final)) v += termValue(w, target, final[i], floor, ceiling, hit);
  return v;
}

// Meta counts for badges you haven't set yourself (explicit "Don't care" = never), unless prefs.meta === false.
export const usesMeta = (prefs, goal) => metaRate(prefs) > 0 && prefs?.values?.[goal.name] === undefined;
const metaPart = (prefs, goal) => usesMeta(prefs, goal) ? META_RATE * metaRate(prefs) * metaOf(goal, prefs?.position, prefs?.mode) : 0;
const drives = Object.fromEntries(goals.map(g => [g.name, g.tiers.some(t => t.requirements.some(r => DRIVE_ATTRS.has(r.name)))]));
// Highest tier worth buying: yours if you've picked the badge, otherwise the meta's.
const tierCapOf = (prefs, goal) => valueOf(prefs, goal) > 0 || prefs?.caps?.[goal.name] != null ? capOf(prefs, goal)
  : Math.min(capOf(prefs, goal), metaCap(goal, prefs?.position));
// Rough per-tier worth for ranking candidates (yours + meta).
const worthOf = (prefs, goal) => valueOf(prefs, goal) + metaPart(prefs, goal);

export function badgeValue(final, height, prefs) {
  let total = 0;
  for (const b of goals) {
    const v = valueOf(prefs, b), m = metaPart(prefs, b);
    if (v <= 0 && m <= 0) continue;
    const rank = tierRank(badgeTier(b, final, height));
    if (v > 0) total += v * worthRank(prefs, b, rank);
    if (m > 0) total += m * dunkFactor(b, height) * gatedTierWorth(b, Math.min(rank, tierCapOf(prefs, b)), prefs?.position, final[idx.driving_dunk])
      * (drives[b.name] ? driveFactor(final[idx.speed_with_ball]) : 1);
  }
  return total;
}

// Meta score of a set of ratings, independent of your picks: Σ meta worth × tier (up to the meta's tier cap), plus
// attribute meta (mobility, floors) and the driving gate, as a share (0–100) of everything the meta values for that
// position and height — so a center and a wing are compared on how meta they are, not on how long their lists are.
function metaParts(final, height, position, mode) {
  let total = 0;
  for (const b of goals) {
    const m = metaOf(b, position, mode);
    if (m > 0 && inHeight(b, height)) total += m * dunkFactor(b, height)
      * gatedTierWorth(b, Math.min(tierRank(badgeTier(b, final, height)), metaCap(b, position)), position, final[idx.driving_dunk])
      * (drives[b.name] ? driveFactor(final[idx.speed_with_ball]) : 1);
  }
  for (const [name, [w, target, floor = 60, ceiling = 99, hit = 0]] of Object.entries(attrMetaFor(position, height, final)))
    total += termValue(w * ATTR_META_RATE * CONTINUOUS_RATE / META_RATE, target - 60, Math.max(0, final[idx[name]] - 60),
      Math.max(0, floor - 60), ceiling - 60, hit);
  return total;
}
// Almost there counts a little: a meta badge tier 1 Cap Breaker away adds half its worth, 2 away a quarter, scaled by
// the share of the 28 breakers you still have to get (a build already using 20 has fewer left for it). E.g. 82 strength
// on a big one breaker from Brick Wall silver (83). near: { applied, ladders, used } — from derive (applied, ladders,
// breakerCount) or nearOf(plan). Breakers beyond 5 per attribute or past the cap don't count.
export const NEAR_CREDIT = [0, 0.5, 0.25];
function nearParts(final, near, height, position, mode) {
  const avail = Math.max(0, MAX_CAP_BREAKERS - (near.used ?? 0)) / MAX_CAP_BREAKERS;
  if (avail <= 0) return 0;
  // Breakers needed to lift attribute i to m (Infinity if its ladder can't get there).
  const need = (i, m) => {
    let v = final[i], k = 0;
    for (let step = near.applied[i]; v < m; step++) {
      const g = near.ladders[i][step];
      if (step >= 5 || !g) return Infinity;
      v += g; k++;
    }
    return k;
  };
  let total = 0;
  for (const b of goals) {
    const m = metaOf(b, position, mode);
    if (m <= 0 || !inHeight(b, height)) continue;
    const cap = metaCap(b, position), rank = Math.min(tierRank(badgeTier(b, final, height)), cap);
    if (rank >= cap || rank >= b.tiers.length) continue;
    const next = b.tiers[rank];
    let k = Infinity;
    for (const floor of alternatives(next)) k = Math.min(k, floor.reduce((s, f, i) => s + (f > final[i] ? need(i, f) : 0), 0));
    if (k < 1 || k >= NEAR_CREDIT.length) continue;
    const dunk = final[idx.driving_dunk];
    total += NEAR_CREDIT[k] * avail * m * dunkFactor(b, height) * (gatedTierWorth(b, rank + 1, position, dunk) - gatedTierWorth(b, rank, position, dunk))
      * (drives[b.name] ? driveFactor(final[idx.speed_with_ball]) : 1);
  }
  return total;
}
export function nearOf(r) {
  const caps = capsFor(r.body), h = r.body.height, type = r.playerType ?? overall(r.base, h).playerType;
  return { applied: r.breakers, used: r.breakers.reduce((s, n) => s + n, 0),
    ladders: r.base.map((v, i) => ladder(i, v, caps[i], h, type)) };
}
export const nearOfDerived = d => ({ applied: d.applied, ladders: d.ladders, used: d.breakerCount });
const metaMax = new Map();
function metaMaxOf(height, position, mode) {
  const key = [height, position, mode].join();
  if (!metaMax.has(key)) metaMax.set(key, metaParts(attributes.map(() => 99), height, position, mode));
  return metaMax.get(key);
}
export function metaScore(final, height, position, mode = '5v5', near = null) {
  const share = 100 * (metaParts(final, height, position, mode) + (near ? nearParts(final, near, height, position, mode) : 0))
    / Math.max(1e-9, metaMaxOf(height, position, mode));
  return share * heightMeta(height, position) * shootingGate(final[idx.three_point])
    * reboundGate(final[idx.defensive_rebound], position, height, final[idx.speed_with_ball])
    * finishGate(final[idx.driving_dunk], final[idx.driving_layup])
    * dunklessGate(final, position) * oboardGate(final[idx.offensive_rebound], position);
}

// Goal name → tier rank (up to its worth-paying cap) for every valued badge/animation these ratings hold.
export function heldTiers(final, height, prefs) {
  const held = new Map();
  for (const b of goals) {
    if (valueOf(prefs, b) <= 0) continue;
    const r = worthRank(prefs, b, tierRank(badgeTier(b, final, height)));
    if (r) held.set(b.name, r);
  }
  return held;
}

export const byName = Object.fromEntries(goals.map(b => [b.name, b]));

// Attributes some real meta badge uses at this position (worth ≥ 1.5 at its best counted tier). Post Control only
// feeds post badges (Post Fade silver+ is low-normal at best), so on most builds it isn't one.
export function metaAttributes(position, height) {
  const out = new Set();
  for (const g of goals) if (inHeight(g, height) && metaOf(g, position) * metaTierWorth(g, metaCap(g, position)) >= 1.5)
    for (const t of g.tiers) for (const q of t.requirements) out.add(q.attribute ?? idx[q.name]);
  return out;
}

// Ratings that are only there to hold the archetype (the "archetype tax"): 6 points lower and the build turns into
// another archetype (so every Cap Breaker ladder changes), yet no badge the meta cares about (worth ≥ 1 at this
// position) loses a tier. d: a derived build (see derive). E.g. 71 Post Control on a 7'0" C keeping it archetype #1.
export function archetypeHolders(d, drop = 6) {
  const type = d.state.playerType, out = [];
  for (let i = 0; i < d.ratings.length; i++) {
    // Smallest drop (1…drop) that flips the archetype; free = how many points you could still take off safely.
    let k = 0, to = type;
    for (let x = 1; x <= drop && d.ratings[i] - x >= 25; x++) { to = overall(d.ratings.map((v, j) => j === i ? v - x : v), d.height).playerType; if (to !== type) { k = x; break; } }
    if (!k) continue;
    const finals = d.final.map((v, j) => j === i ? v - k : v);
    const costs = goals.some(g => metaOf(g, d.position) * metaTierWorth(g, metaCap(g, d.position)) >= 1.5 && inHeight(g, d.height)
      && tierRank(badgeTier(g, finals, d.height)) < tierRank(badgeTier(g, d.final, d.height)));
    if (!costs) out.push({ i, rating: d.ratings[i], to, free: k - 1 });
  }
  return out;
}
function meets(final, height, required) {
  for (const [name, rank] of required) if (tierRank(badgeTier(byName[name], final, height)) < rank) return false;
  return true;
}

// ---------------------------------------------------------------- breakpoints

// Every rating at which some in-height badge tier (or a specialization) gains a requirement on attribute i.
export function breakpointsFor(i, height, category = '') {
  const map = new Map();
  const add = (rating, entry) => { if (!map.has(rating)) map.set(rating, []); map.get(rating).push(entry); };
  for (const b of goals) {
    if (!inHeight(b, height)) continue;
    for (const t of b.tiers) for (const r of t.requirements)
      if (r.attribute === i) add(r.minimum, { badge: b, tier: t.tier, alone: t.requirements.length === 1 });
  }
  const spec = specMinimums(category)[i];
  if (spec > 25) add(spec, { specialization: category });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([rating, unlocks]) => ({ rating, unlocks }));
}

// The next breakpoint above the current final rating that matters (a valued badge or the specialization).
// ceilings (optional): highest final rating reachable per attribute (body caps / maximums); breakpoints above it are
// skipped, so nothing leans toward a tier this body can never get.
export function nextBreakpoint(i, final, height, prefs, category = '', ceilings = null) {
  return breakpointsFor(i, height, category).find(p => p.rating > final[i] && (!ceilings || p.rating <= ceilings[i]) &&
    p.unlocks.some(u => u.specialization || (worthOf(prefs, u.badge) > 0 && tierRank(u.tier) <= tierCapOf(prefs, u.badge) &&
      tierRank(u.tier) > tierRank(badgeTier(u.badge, final, height))))) ?? null;
}

/**
 * Lowest final rating for each non-continuous attribute that keeps every required badge tier
 * (and the given extra floors). Attributes are lowered one at a time, so OR-branches stay consistent.
 */
export function liveFloors(final, height, { required, continuous = [], extra = empty(), category = '' } = {}) {
  const keep = new Set(continuous.map(k => typeof k === 'number' ? k : idx[k]));
  const floors = [...final];
  for (let i = 0; i < N; i++) {
    if (keep.has(i)) continue;
    const lo = Math.max(25, extra[i]);
    const candidates = [...new Set([lo, ...breakpointsFor(i, height, category).map(p => p.rating)])]
      .filter(v => v >= lo && v < final[i]).sort((a, b) => a - b);
    for (const v of candidates) {
      const trial = floors.map((f, j) => j === i ? v : f);
      if (meets(trial, height, required)) { floors[i] = v; break; }
    }
  }
  return floors;
}

// Points above the live floor that buy nothing, per attribute (0 for continuous attributes).
export function deadWeight(final, height, prefs, category = '', base = null) {
  const required = heldTiers(final, height, prefs);
  const extra = category && base && specUnlocked(category, base) ? specMinimums(category) : empty();
  const floors = liveFloors(final, height, { required, continuous: prefs.continuous, extra, category });
  return { floors, slack: final.map((v, i) => v - floors[i]) };
}

// ---------------------------------------------------------------- optimizer

const ctxFor = body => ({ body, h: body.height, caps: capsFor(body), solve: satisfy });
const fits = (t, caps) => t.every((v, i) => v <= caps[i]);
const estimate = (t, ctx) => overall(clampLinks(t, ctx.h, ctx.caps), ctx.h).score;

// Cheapest way to satisfy floors plus a set of required badge tiers. Branches are pre-ranked without
// breakers (cheap), then the best few are solved with the breaker pool.
function cheapestPlan(floors, required, ctx, pool, keep = 5) {
  let branches = [floors];
  for (const { badge, tier } of required) {
    if (!inHeight(badge, ctx.h)) return null;
    const options = alternatives(badge.tiers.find(t => t.tier === tier));
    const merged = new Map();
    for (const b of branches) for (const o of options) {
      const m = mergeFloors(b, o);
      if (fits(m, ctx.caps)) merged.set(m.join(','), m);
    }
    branches = [...merged.values()].sort((a, b) => estimate(a, ctx) - estimate(b, ctx)).slice(0, 16);
    if (!branches.length) return null;
  }
  let best = null;
  for (const t of branches.slice(0, keep)) {
    const plan = ctx.solve(t, ctx, pool);
    if (plan && (!best || plan.ovr < best.plan.ovr)) best = { targets: t, plan };
  }
  return best;
}

/**
 * Optimize one body badge-first.
 * opts: { values, continuous:[names], continuousWeights?:{name:w}, minimums:number[21] (final ratings),
 *   breakers:{ general, future, special:{category,count} }, mustHave:{ badgeName: tier }, exclude?:{badgeName:maxRank} }
 */
// Seeds for the restarts below: the meta badges worth the most that the greedy result left short of their meta tier
// (typically lumpy ones like Gold Posterizer at 93 driving dunk: no single step looks cheap, so a greedy never starts).
function seedsFor(r, body, opts, n) {
  const out = [];
  for (const g of goals) {
    const m = metaPart({ ...opts, position: body.position }, g);
    if (m <= 0 || !inHeight(g, body.height) || opts.mustHave?.[g.name]) continue;
    const have = tierRank(badgeTier(g, r.final, body.height)), top = Math.min(tierCapOf(opts, g), tierRank(g.tiers.at(-1).tier));
    if (have >= top) continue;
    const gain = m * dunkFactor(g, body.height) * (metaTierWorth(g, top) - metaTierWorth(g, have));
    if (gain > 0) out.push({ name: g.name, tier: tiers[top - 1], gain });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, n);
}

export function optimizeBody(body, opts) {
  let first = optimizeOnce(body, opts);
  if (first.error) return first;
  // Restarts (Sahni's partial enumeration for knapsack: fix a few high-value items, fill the rest greedily, keep the
  // best): force each seed in turn as a must, finish greedily, keep whichever scores best.
  if (opts.seeds && opts.forceType == null) for (const seed of seedsFor(first, body, opts, opts.seeds)) {
    const r = optimizeOnce(body, { ...opts, mustHave: { ...opts.mustHave, [seed.name]: seed.tier } });
    if (!r.error && r.value > first.value + 1e-9) first = { ...r, seed };
  }
  // beat: the score this plan has to beat (a forced archetype vs the natural one, see pickArchetype). The take-back pass
  // adds at most ~7.9 (measured over 215 forced plans in six presets), so a plan further behind than DROP_REACH can't
  // win and skips it: about a third of forced jobs, and the slowest ones.
  if (!opts.noDrop && !(opts.beat != null && archetypeScore(first, body, opts) + DROP_REACH < opts.beat)) first = dropPass(first, body, opts);
  if (!opts.refine) return first;
  // Second pass: lock in what the first pass reached and look for a cheaper arrangement of it.
  const mustHave = { ...opts.mustHave };
  for (const [name, rank] of heldTiers(first.final, body.height, opts))
    if (tierRank(mustHave[name]) < rank && rank <= (opts.exclude?.[name] ?? 4)) mustHave[name] = tiers[rank - 1];
  const second = optimizeOnce(body, { ...opts, mustHave });
  return !second.error && second.value > first.value + 1e-9 ? second : first;
}

// Take-back pass: the greedy fill buys Overall in chunks and never sells it back, so a cheap attribute that unlocks lots
// of small badges (Post Control → six post badges) can soak up Overall that a meta attribute would use better. Cap the
// highest ratings that aren't meta for this position (not your feel picks, minimums or leftover list) one at a time,
// re-plan, and keep a version only if picks + meta improve. E.g. a 6'11" C: Post Control 86 → 60, meta 66.8 → 67.7.
const DROP_TRIES = 3, DROP_TO = 60, DROP_REACH = 8;
function dropPass(first, body, opts) {
  const group = metaGroup(body.position), keep = new Set([...LEFTOVER[group], ...Object.keys(attrMetaFor(body.position, body.height)),
    ...(opts.continuous ?? []).map(k => typeof k === 'number' ? attributes[k].name : k)]);
  // Attributes a real meta badge uses aren't dropped: vertical feeds dunks and boards, layup the finishing badges.
  const metaUse = metaAttributes(body.position, body.height);
  // Never below what the specialization needs (its unlock floors).
  const category = opts.breakers?.special?.category ?? '', spec = category ? specMinimums(category) : empty();
  const tries = attributes.map((a, i) => i).filter(i => !keep.has(attributes[i].name) && !metaUse.has(i) && first.final[i] > DROP_TO + 5
    && (opts.minimums?.[i] ?? 25) <= DROP_TO && spec[i] <= 25).sort((i, j) => first.final[j] - first.final[i]).slice(0, DROP_TRIES);
  let best = first, bestScore = archetypeScore(first, body, opts);
  for (const i of tries) {
    const maximums = attributes.map((_, j) => j === i ? Math.min(opts.maximums?.[j] ?? 99, DROP_TO) : opts.maximums?.[j] ?? 99);
    const r = optimizeOnce(body, { ...opts, maximums, mustHave: best.seed ? { ...opts.mustHave, [best.seed.name]: best.seed.tier } : opts.mustHave });
    if (r.error) continue;
    const sc = archetypeScore(r, body, opts);
    if (sc > bestScore + 0.25) { best = { ...r, seed: best.seed }; bestScore = sc; }
  }
  return best;
}

// Last scraps of Overall: ratings that pay off point by point for the role. Breakpoint attributes (strength, boards,
// block, dunk) stay off this list: a spare point there only makes an in-between rating (89 strength, 92 board).
const LEFTOVER = {
  guard: ['speed', 'agility', 'steal', 'three_point', 'perimeter_defense', 'ball_handle', 'speed_with_ball', 'free_throw'],
  wing: ['speed', 'agility', 'three_point', 'perimeter_defense', 'steal', 'ball_handle', 'free_throw'],
  big: ['speed', 'agility', 'free_throw', 'three_point'],
};
function optimizeOnce(body, opts) {
  opts = { ...opts, position: body.position, height: body.height }; // meta is position- and height-aware
  const ctx = ctxFor(body);
  // forceType: plan every Cap Breaker as that archetype and keep the build in it (see satisfyAs).
  ctx.solve = opts.forceType != null ? (t, c, p) => satisfyAs(t, c, { ...p, preset: opts.presetBreakers }, opts.forceType) : satisfy;
  // Per-attribute maximums (final rating): nothing worth paying for above them, e.g. driving layup 85 next to a 99 dunk.
  const maxes = attributes.map((_, i) => Math.min(ctx.caps[i], opts.maximums?.[i] ?? 99));
  ctx.maxes = maxes;
  ctx.baseMin = (opts.breakers?.special?.category ?? '') ? specMinimums(opts.breakers.special.category) : null;
  const ok = t => t.every((v, i) => v <= maxes[i]);
  const { minimums = empty(), mustHave = {}, exclude = {} } = opts;
  const category = opts.breakers?.special?.category ?? '';
  const special = { category, count: category ? MAX_SPECIALIZED : 0 };
  const now = (opts.breakers?.general ?? 0);
  const future = opts.breakers?.future ?? 0;
  const ceiling = opts.baseCeiling ?? BASE_CEILING;
  const pool = { general: now + future, special };
  let floors = mergeFloors(minimums, category ? specMinimums(category) : empty());
  if (!fits(floors, ctx.caps)) return { body, error: 'Minimums are above this body’s caps.' };
  floors = floors.map((v, i) => Math.min(v, maxes[i]));

  const required = Object.entries(mustHave).filter(([, t]) => t).map(([name, tier]) => ({ badge: byName[name], tier }));
  const start = cheapestPlan(floors, required, ctx, pool);
  if (!start) return { body, error: 'Must-have badges don’t fit this body.' };
  let { targets, plan } = start;
  const val = f => objective(f, ctx.h, opts);
  const upgrades = [];

  for (let round = 0, pruned = 0; round < 80; round++) {
    const current = val(plan.final);
    const terms = continuousTerms(opts, plan.final);
    const cheap = [];
    const base = estimate(targets, ctx);
    for (const badge of goals) {
      const v = worthOf(opts, badge);
      if (v <= 0 || !inHeight(badge, ctx.h)) continue;
      const rank = tierRank(badgeTier(badge, plan.final, ctx.h));
      for (const tier of badge.tiers) {
        const r = tierRank(tier.tier);
        if (r <= rank || r > Math.min(exclude[badge.name] ?? 4, capOf(opts, badge))) continue;
        for (const alt of alternatives(tier)) {
          const t = mergeFloors(targets, alt);
          if (!ok(t) || t.every((x, i) => x === targets[i])) continue;
          const cost = estimate(t, ctx) - base;
          const worth = valueOf(opts, badge) * (r - rank) + metaPart(opts, badge) * (metaTierWorth(badge, r) - metaTierWorth(badge, rank));
          cheap.push({ t, badge, tier: tier.tier, ratio: worth / Math.max(0.05, cost) });
        }
      }
    }
    for (const [i, w] of terms) { // (target-aware value is re-checked through val below)
      const from = Math.max(targets[i], plan.final[i]);
      for (const step of [2, 5]) {
        const to = Math.min(maxes[i], from + step);
        if (to <= from) continue;
        const t = targets.map((x, j) => j === i ? to : x);
        cheap.push({ t, attribute: i, to, ratio: w * (to - plan.final[i]) / Math.max(0.05, estimate(t, ctx) - base) });
      }
    }
    cheap.sort((a, b) => b.ratio - a.ratio);
    let best = null;
    for (const c of cheap.slice(0, 16)) {
      const p = ctx.solve(c.t, ctx, pool);
      if (!p) continue;
      const gain = val(p.final) - current;
      if (gain <= 1e-9) continue;
      const ratio = gain / Math.max(0.02, p.ovr - plan.ovr);
      if (!best || ratio > best.ratio) best = { ...c, p, gain, ratio };
    }
    if (!best) {
      // Drop targets made redundant by later picks (an OR branch now covered by another rating, e.g. Sync
      // Snatcher's 82 offensive rebound once defensive rebound is 95), then try to spend what that frees.
      const lean = pruneTargets(targets, plan, floors, ctx, opts, pool, val);
      if (!lean || pruned++ > 2) break;
      targets = lean.targets; plan = lean.plan;
      continue;
    }
    targets = best.t; plan = best.p;
    upgrades.push(best.badge ? { badge: best.badge.name, tier: best.tier, gain: best.gain }
      : { attribute: best.attribute, to: best.to, gain: best.gain });
  }

  // Leftover budget: continuous attributes first, then toward reachable breakpoints, then scraps (the build must reach 99).
  const reach = maxes.map((m, j) => Math.min(m, ctx.caps[j]));
  const spend = (plan, targets) => {
    const cw = opts.continuousWeights ?? {};
    const terms = continuousTerms(opts, plan.final);
    const feelNow = terms.map(([i]) => i);
    // Marginal weight now: full below each term's target, a quarter above.
    const weights = attributes.map((a, i) => { const t = terms.find(x => x[0] === i);
      const f = plan.final[i];
      return t ? t[1] * (f < (t[3] ?? 0) ? 3 : f < t[2] ? 1 : f < (t[4] ?? 99) ? 0.25 : 0) / CONTINUOUS_RATE : 0; });
    let filled = feelNow.length ? fill(plan, weights, ctx, [], targets, maxes) : plan;
    if (filled.ovr < 99 - 0.05) {
      // Lean toward the next breakpoint that's worth something (a Normal pick, or a meta badge of about "normal" or
      // better): near-worthless meta tiers (HoF Hook Specialist, Ghost Stepper) don't pull leftover points.
      const lean = attributes.map((_, i) => {
        const next = nextBreakpoint(i, filled.final, ctx.h, opts, special.category, reach);
        if (!next) return 0;
        const worth = Math.max(0, ...next.unlocks.map(u => u.specialization ? 1 : worthOf(opts, u.badge)));
        return worth >= 0.2 ? worth / (1 + next.rating - filled.final[i]) : 0;
      });
      filled = fill(filled, lean, ctx, [], targets, maxes.map(m => Math.min(m, ceiling)));
    }
    if (filled.ovr < 99 - 0.05) {
      // Last scraps go to ratings that matter on the floor for this role, not to whatever is cheapest (no 99 pass or
      // 86 offensive rebound as filler). Anything left after that stays unspent.
      const useful = LEFTOVER[metaGroup(opts.position)] ?? LEFTOVER.wing;
      // …and never past a meta ceiling (free throw stops at 75: more is wasted Overall).
      const metaCeil = attrMetaFor(opts.position, opts.height);
      const loose = fill(filled, attributes.map(a => useful.includes(a.name) ? 1 : 0), ctx, [], null,
        maxes.map((m, i) => Math.min(m, ceiling, metaCeil[attributes[i].name]?.[3] ?? 99)));
      if (val(loose.final) >= val(filled.final) - 1e-9 && loose.final.every((v, i) => v >= targets[i])) filled = loose;
    }
    return { filled, feelNow };
  };
  let { filled, feelNow } = spend(plan, targets);
  // Settle: keep what the build holds, re-place the Cap Breakers where they save the most Overall (lower an expensive
  // base and break it back up), then spend what that frees. Repeats while it helps.
  for (let pass = 0; pass < 2; pass++) {
    const held = new Map();
    for (const g of goals) {
      if (worthOf(opts, g) <= 0) continue;
      const r = Math.min(tierRank(badgeTier(g, filled.final, ctx.h)), tierCapOf(opts, g));
      if (r) held.set(g.name, r);
    }
    for (const { badge, tier } of required) held.set(badge.name, Math.max(held.get(badge.name) ?? 0, tierRank(tier)));
    const lean = liveFloors(filled.final, ctx.h, { required: held, continuous: feelNow, extra: floors, category: special.category });
    const settled = ctx.solve(lean, ctx, pool);
    if (!settled || settled.ovr > filled.ovr + 1e-9) break;
    const again = spend(settled, lean);
    if (val(again.filled.final) <= val(filled.final) + 1e-9) break;
    ({ filled, feelNow } = again); targets = lean;
  }
  // The game only accepts a build filled to 99: spend any room left (feel attributes first, then anything your maximums
  // allow) without lowering a single final rating — a base raise can change the archetype and shrink breaker gains.
  {
    const feelSet = new Set(feelNow.map(k => typeof k === 'number' ? k : idx[k]));
    const weights = attributes.map((_, i) => feelSet.has(i) ? 1 : 0.2);
    const topped = fill(filled, weights, ctx, [], filled.final, opts.maximums ?? 99);
    if (topped.ovr > filled.ovr + 1e-9) filled = { ...filled, ...topped };
  }
  return finishPlan(body, opts, ctx, filled, { targets, upgrades, feelNow, fallback: start.plan });
}

// Shared tail of every optimizer result: the requirements-only template, the breaker schedule and today's ratings.
function finishPlan(body, opts, ctx, filled, { targets, upgrades = [], feelNow, fallback = null }) {
  const category = opts.breakers?.special?.category ?? '';
  const special = { category, count: category ? MAX_SPECIALIZED : 0 };
  const now = opts.breakers?.general ?? 0, future = opts.breakers?.future ?? 0;
  const floors = mergeFloors(opts.minimums ?? empty(), category ? specMinimums(category) : empty());
  const required = Object.entries(opts.mustHave ?? {}).filter(([, t]) => t).map(([name, tier]) => ({ badge: byName[name], tier }));
  const val = f => objective(f, ctx.h, opts);
  // The requirements-only template: musts + minimums + specialization met by base ratings alone (no Cap Breakers), nothing
  // else spent. Falls back to the breaker plan when the requirements can't fit under 99 without breakers.
  const bare = cheapestPlan(floors, required, ctx, { general: 0, special: { category, count: 0 } });
  const tp = bare?.plan ?? fallback ?? filled;
  const template = { manual: tp.manual, base: tp.base, breakers: tp.breakers, final: tp.final, ovr: tp.ovr, needsBreakers: !bare };
  const result = { body, ...filled, template, targets: targets ?? filled.final, upgrades, value: val(filled.final), badgeValue: badgeValue(filled.final, ctx.h, opts),
    budget: now + future, now, future, category: special.category, specialCount: special.count };
  result.schedule = breakerSchedule(result, ctx, opts, feelNow ?? continuousTerms(opts, filled.final).map(t => t[0]));
  result.today = todayFinal(result, ctx, now + special.count);
  result.todayValue = val(result.today);
  return result;
}

// ---------------------------------------------------------------- exact planner (MIP)

// The scoring the exact planner maximizes: the same picks + meta the Lab ranks by (archetypeScore = objective +
// ARCH_META × metaScore), written as per-attribute values and per-tier badge worths. The meta score's gates (three under
// 78, boards under 85) multiply everything, so they're linearized around a hint build (usually the greedy result):
// each gate counts as a penalty on its own attribute, scaled by the hint's meta.
function mipSpec(body, opts, type, hint) {
  opts = { ...opts, position: body.position, height: body.height };
  const h = body.height, pos = body.position, caps = capsFor(body), mode = opts.mode ?? '5v5';
  const category = opts.breakers?.special?.category ?? '';
  const maxes = attributes.map((_, i) => Math.min(caps[i], opts.maximums?.[i] ?? 99));
  const spec0 = category ? specMinimums(category) : empty();
  const minimums = mergeFloors(opts.minimums ?? empty(), spec0).map((v, i) => Math.min(v, maxes[i]));
  const metaOn = metaRate(opts) > 0;
  const hintFinal = hint?.final ?? minimums;
  const K = metaOn ? archMetaRate(opts) * 100 * heightMeta(h, pos) / Math.max(1e-9, metaMaxOf(h, pos, mode)) : 0;
  const share = metaParts(hintFinal, h, pos, mode);
  const g3 = shootingGate(hintFinal[idx.three_point]);
  const gReb = f => reboundGate(f, pos, h, hintFinal[idx.speed_with_ball]);
  const gR0 = gReb(hintFinal[idx.defensive_rebound]);
  const gF = finishGate(hintFinal[idx.driving_dunk], hintFinal[idx.driving_layup]);
  const gR = gR0 * gF * dunklessGate(hintFinal, pos) * oboardGate(hintFinal[idx.offensive_rebound], pos); // gates other than the one being linearized multiply the linear parts
  const terms = continuousTerms(opts, hintFinal);
  const metaTerms = metaOn ? Object.entries(attrMetaFor(pos, h, hintFinal)).map(([name, [w, target, floor = 60, ceiling = 99, hit = 0]]) => [idx[name], w, target, floor, ceiling, hit]) : [];
  const smooth = new Set([...terms.map(t => t[0]), ...metaTerms.map(t => t[0])]);
  if (metaOn) { smooth.add(idx.three_point); smooth.add(idx.driving_dunk); if (gR0 < 1 || metaGroup(pos) === 'big' || h >= 81) smooth.add(idx.defensive_rebound); }
  const attrValue = (i, f) => {
    let v = 0;
    for (const [j, w, target, floor, ceiling, hit] of terms) if (j === i) v += termValue(w, target, f, floor, ceiling, hit);
    for (const [j, w, target, floor, ceiling, hit] of metaTerms) if (j === i)
      v += K * g3 * gR * termValue(w * ATTR_META_RATE * CONTINUOUS_RATE / META_RATE, target - 60, Math.max(0, f - 60), Math.max(0, floor - 60), ceiling - 60, hit);
    if (K && i === idx.three_point) v += K * share * gR * shootingGate(f);
    if (K && i === idx.defensive_rebound) v += K * share * g3 * gF * gReb(f);
    if (K && i === idx.driving_dunk) v += K * share * g3 * gR0 * finishGate(f, hintFinal[idx.driving_layup]);
    return v;
  };
  const goalsOut = [], marks = {};
  for (const b of goals) {
    if (!inHeight(b, h)) continue;
    const v = valueOf(opts, b), m = metaPart(opts, b), ms = K ? metaOf(b, pos, mode) : 0, df = dunkFactor(b, h);
    const must = tierRank(opts.mustHave?.[b.name]);
    if (v <= 0 && m <= 0 && ms <= 0 && !must) continue;
    const step = (k, cap, worth) => worth(Math.min(k, cap)) - worth(Math.min(k - 1, cap));
    const tiersOut = b.tiers.map((t, n) => {
      const k = n + 1;
      const plainUser = v > 0 ? v * step(k, capOf(opts, b), x => x) : 0;
      // Meta worth split into the part every build gets and the strength part that only a dunker gets (STRENGTH_FREE).
      const free = strengthFree(b, pos);
      const freeW = x => metaTierWorth(b, free == null ? x : Math.min(x, free)), gatedW = x => metaTierWorth(b, x) - freeW(x);
      const metaOfPart = worth => (m > 0 ? m * df * step(k, tierCapOf(opts, b), worth) : 0)
        + (ms > 0 ? K * g3 * gR * ms * df * step(k, metaCap(b, pos), worth) : 0);
      const meta = metaOfPart(freeW), strength = free == null ? 0 : metaOfPart(gatedW);
      const alts = alternatives(t).map(floor => floor.map((f, i) => [i, f]).filter(([, f]) => f > 25));
      for (const alt of alts) for (const [i, f] of alt) (marks[i] ??= new Set()).add(f);
      const gates = [];
      if (drives[b.name] && meta > 1e-12) gates.push({ attr: idx.speed_with_ball, fn: driveFactor, worth: meta });
      if (strength > 1e-12) gates.push({ attr: idx.driving_dunk, fn: dunkGate, worth: strength });
      return { alts, plain: plainUser + (drives[b.name] ? 0 : meta), gates };
    });
    goalsOut.push({ must, tiers: tiersOut });
  }
  const eligible = new Set(attributes.filter(a => category && (a.discipline === category || a.name === 'free_throw')).map(a => a.index));
  return { h, type, caps, minimums, maximums: maxes, baseMin: category ? spec0 : null,
    general: (opts.breakers?.general ?? 0) + (opts.breakers?.future ?? 0), specialCount: category ? MAX_SPECIALIZED : 0, eligible,
    smooth, marks: Object.fromEntries(Object.entries(marks).map(([i, s]) => [i, [...s]])), attrValue, goals: goalsOut,
    links: linksFor(h) };
}

// Exact plan for one body as one archetype; null when the solver isn't loaded, nothing fits, or the plan doesn't hold up
// under the real game rules (links, Overall, the archetype it planned for, musts and minimums).
export function mipBody(body, opts, type, hint = null) {
  if (!mipReady()) return null;
  const spec = mipSpec(body, opts, type, hint);
  if (hint && opts.mipRadius) spec.near = { final: hint.final, breakers: hint.breakers, radius: opts.mipRadius };
  let sol = solvePlan(spec, { timeLimit: opts.mipTime ?? 4, full: opts.mipFull ?? true });
  if (!sol?.base) return null;
  const ctx = ctxFor(body);
  const base = clampLinks(sol.base, ctx.h, ctx.caps);
  const s = overall(base, ctx.h);
  if (s.score > 99 + 1e-8 || !base.every((v, i) => v <= ctx.caps[i])) return null;
  const final = finalsFor(base, sol.breakers, ctx);
  if (final.some((v, i) => v < spec.minimums[i])) return null;
  const required = new Map(Object.entries(opts.mustHave ?? {}).filter(([, t]) => t).map(([n, t]) => [n, tierRank(t)]));
  if (!meets(final, ctx.h, required)) return null;
  const category = opts.breakers?.special?.category ?? '';
  const elig = i => category && (attributes[i].discipline === category || attributes[i].name === 'free_throw');
  const special = category ? MAX_SPECIALIZED : 0;
  const onElig = sol.breakers.reduce((t, n, i) => t + (elig(i) ? n : 0), 0);
  const specialUsed = Math.min(special, onElig), generalUsed = sol.breakers.reduce((t, n) => t + n, 0) - specialUsed;
  const plan = { manual: base, base, breakers: sol.breakers, final, ovr: s.score, playerType: s.playerType, generalUsed, specialUsed };
  return { ...finishPlan(body, { ...opts, position: body.position, height: body.height }, ctx, plan, {}), exact: true,
    mip: { status: sol.status, planned: type, size: sol.size } };
}

// Lower each target to the lowest breakpoint that keeps every valued tier the targets alone already earn.
// Returns a cheaper plan with the same badge value, or null when nothing was redundant.
function pruneTargets(targets, plan, floors, ctx, opts, pool, val) {
  const required = heldTiers(targets, ctx.h, opts);
  const lean = liveFloors(targets, ctx.h, { required, extra: floors }).map((v, i) => Math.max(v, floors[i]));
  if (lean.every((v, i) => v === targets[i])) return null;
  const p = ctx.solve(lean, ctx, pool);
  if (!p || val(p.final) < val(plan.final) - 1e-6 || p.ovr > plan.ovr - 1e-6) return null;
  return { targets: lean, plan: p };
}

// Order in which to apply the planned Cap Breakers: each step is the next breaker on some attribute,
// picked for the most badge value (ties: continuous attributes, then the biggest gain).
export function breakerSchedule(plan, ctx, prefs, continuous = []) {
  const k = new Array(N).fill(0), steps = [];
  const total = plan.breakers.reduce((s, n) => s + n, 0);
  const special = { category: plan.category, left: plan.specialCount };
  for (let s = 0; s < total; s++) {
    const before = finalsFor(plan.base, k, ctx);
    const vBefore = badgeValue(before, ctx.h, prefs);
    let best = null;
    for (let i = 0; i < N; i++) {
      if (k[i] >= plan.breakers[i]) continue;
      const trial = k.map((n, j) => j === i ? n + 1 : n);
      const after = finalsFor(plan.base, trial, ctx);
      const gain = badgeValue(after, ctx.h, prefs) - vBefore;
      const score = gain * 1000 + (continuous.includes(i) ? 100 : 0) + (after[i] - before[i]);
      if (!best || score > best.score) best = { i, after, before, score, gain };
    }
    k[best.i]++;
    const eligible = special.category && special.left > 0 &&
      (attributes[best.i].discipline === special.category || attributes[best.i].name === 'free_throw');
    if (eligible) special.left--;
    const gained = goals.filter(b => tierRank(badgeTier(b, best.after, ctx.h)) > tierRank(badgeTier(b, best.before, ctx.h)))
      .map(b => ({ badge: b.name, tier: badgeTier(b, best.after, ctx.h) }));
    steps.push({ attribute: best.i, from: best.before[best.i], to: best.after[best.i], specialized: !!eligible, gained });
  }
  return steps;
}

function todayFinal(plan, ctx, count) {
  const k = new Array(N).fill(0);
  for (const step of plan.schedule.slice(0, count)) k[step.attribute]++;
  return finalsFor(plan.base, k, ctx);
}

// ---------------------------------------------------------------- trade-offs

/**
 * "Drop this badge one tier to gain a lot": for each valued badge tier the plan holds, re-optimize the
 * body with every other held tier kept and that badge capped one tier lower, and report what it buys.
 */
export function tradeOffs(plan, opts, { onProgress, limit = 8, focus = null } = {}) {
  // focus (optional): { opts, goals: [names], attrs: [names], label } — "what's the cheapest requirement to lower to get
  // this?" Re-optimizes toward focus.opts, keeps every other held tier and the feel attributes, and ranks by what the
  // focus gains instead of overall value.
  const h = plan.body.height;
  const held = heldTiers(plan.final, h, opts);
  // Musts this build actually meets are requirements too (a must it doesn't meet would only block every re-plan).
  const musts = {};
  for (const [n, t] of Object.entries(opts.mustHave ?? {})) {
    if (!t || !byName[n]) continue;
    const have = tierRank(badgeTier(byName[n], plan.final, h)), want = tierRank(t);
    if (have >= want) { musts[n] = t; held.set(n, Math.max(want, Math.min(held.get(n) ?? 0, have))); }
  }
  opts = { ...opts, mustHave: musts };
  const keepAll = Object.fromEntries([...held].map(([n, r]) => [n, tiers[r - 1]]));
  const baseline = optimizeBody(plan.body, { ...opts, mustHave: { ...opts.mustHave, ...keepAll } });
  const reference = baseline.error || baseline.value <= plan.value + 1e-9 ? plan : baseline;
  const continuous = (opts.continuous ?? []).map(k => idx[k] ?? k);
  const run = focus ? focus.opts : opts;
  const feelFloors = focus ? run.minimums.map((m, i) => continuous.includes(i) ? Math.max(m, plan.final[i]) : m) : run.minimums;
  const focusIdx = (focus?.attrs ?? []).map(k => idx[k]);
  const focusScore = f => (focus?.goals ?? []).reduce((s, n) => s + 10 * tierRank(badgeTier(byName[n], f, h)), 0)
    + focusIdx.reduce((s, i) => s + f[i], 0);
  // With a focus, first re-aim the build with nothing lowered (points on things you don't care about move to the
  // focus for free); each lowered requirement is then credited only with what it adds on top of that.
  let start = reference, free = null;
  if (focus) {
    const aimed = optimizeBody(plan.body, { ...run, mustHave: { ...opts.mustHave, ...keepAll }, minimums: feelFloors });
    if (!aimed.error && focusScore(aimed.final) > focusScore(reference.final)) { start = aimed; free = aimed; }
  }
  // Candidates: each held badge one tier lower; with a focus, also each attribute minimum removed.
  const candidates = [...held].map(([name, rank]) => ({ kind: 'badge', name, rank }));
  if (focus) (opts.minimums ?? []).forEach((m, i) => { if (m > 25 && !continuous.includes(i)) candidates.push({ kind: 'min', i, from: m }); });
  const results = [];
  let done = 0;
  for (const c of candidates) {
    onProgress?.({ done: ++done, total: candidates.length, label: focus ? `Pricing ${focus.label}` : 'Pricing trade-offs' });
    const mustHave = {};
    for (const [n, r] of held) if (c.kind !== 'badge' || n !== c.name) mustHave[n] = tiers[r - 1];
    if (c.kind === 'badge' && c.rank > 1) mustHave[c.name] = tiers[c.rank - 2];
    const minimums = c.kind === 'min' ? feelFloors.map((m, i) => i === c.i ? 25 : m) : feelFloors;
    const exclude = c.kind === 'badge' ? { ...run.exclude, [c.name]: c.rank - 1 } : run.exclude;
    const alt = optimizeBody(plan.body, { ...run, mustHave, minimums, exclude });
    if (alt.error) continue;
    const gained = [], lost = [];
    const from = focus ? start : reference;
    for (const b of goals) {
      if (valueOf(opts, b) <= 0 && !focus?.goals.includes(b.name)) continue;
      const a = tierRank(badgeTier(b, from.final, h)), z = tierRank(badgeTier(b, alt.final, h));
      if (z > a) gained.push({ badge: b.name, from: tiers[a - 1] ?? null, to: tiers[z - 1] });
      if (z < a && (c.kind !== 'badge' || b.name !== c.name)) lost.push({ badge: b.name, from: tiers[a - 1], to: tiers[z - 1] ?? null });
    }
    const physical = continuous.reduce((s, i) => s + alt.final[i] - reference.final[i], 0);
    const net = objective(alt.final, h, opts) - objective(reference.final, h, opts);
    const drop = c.kind === 'badge' ? { drop: c.name, from: tiers[c.rank - 1], to: tiers[c.rank - 2] ?? null }
      : { dropMin: attributes[c.i].name, from: c.from };
    if (focus) {
      const gain = focusScore(alt.final) - focusScore(start.final);
      const attrGains = focusIdx.map(i => [attributes[i].name, alt.final[i] - start.final[i]]).filter(([, x]) => x > 0);
      if (gain > 0 && !lost.length) results.push({ ...drop, gained, lost, net, physical, gain, attrGains, plan: alt });
    } else if (net > -0.25 && (gained.length || physical >= 3)) results.push({ ...drop, gained, lost, net, physical, plan: alt });
  }
  const order = focus ? (a, b) => b.gain - a.gain || b.net - a.net : (a, b) => b.net - a.net || b.physical - a.physical;
  let freeOffer = null;
  if (free) {
    const gained = goals.filter(b => focus.goals.includes(b.name)).map(b => [b, tierRank(badgeTier(b, reference.final, h)), tierRank(badgeTier(b, free.final, h))])
      .filter(([, a, z]) => z > a).map(([b, a, z]) => ({ badge: b.name, from: tiers[a - 1] ?? null, to: tiers[z - 1] }));
    freeOffer = { free: true, gained, lost: [], gain: focusScore(free.final) - focusScore(reference.final), plan: free,
      attrGains: focusIdx.map(i => [attributes[i].name, free.final[i] - reference.final[i]]).filter(([, x]) => x > 0) };
  }
  return { offers: results.sort(order).slice(0, limit), improved: reference !== plan ? reference : null, free: freeOffer };
}

// ---------------------------------------------------------------- across bodies

// Could this body's caps ever hold the minimums, the specialization floors and every must-have tier?
export function capFeasible(body, opts) {
  const caps = capsFor(body);
  const category = opts.breakers?.special?.category ?? '';
  const floors = mergeFloors(opts.minimums ?? empty(), category ? specMinimums(category) : empty());
  if (!fits(floors, caps)) return false;
  for (const [name, tier] of Object.entries(opts.mustHave ?? {})) {
    if (!tier) continue;
    const g = byName[name], t = g.tiers.find(x => x.tier === tier);
    if (!inHeight(g, body.height) || !t) return false;
    if (!alternatives(t).some(alt => fits(mergeFloors(alt, floors), caps))) return false;
  }
  return true;
}

// Bodies to try. Without constraints: a few weight/wingspan frames per height. With opts (musts / minimums): every
// weight × wingspan combination is checked against the caps first, and the frames are picked from the ones that can
// work, so a narrow window (e.g. 6'10" 232 lb 7'4" for Lightning Launch + Possession Closer gold) isn't missed.
export function bodiesFor(positionList, heights, { frames = 3, around, opts } = {}) {
  const out = [];
  const pick = (lo, hi, n) => [...new Set(Array.from({ length: n }, (_, k) => Math.round(lo + (hi - lo) * k / Math.max(1, n - 1))))];
  const constrained = opts && (Object.values(opts.mustHave ?? {}).some(Boolean) || (opts.minimums ?? []).some(v => v > 25));
  for (const position of positionList) for (const row of positions[position]) {
    if (row.height < heights[0] || row.height > heights[1]) continue;
    const mid = defaultBody(position, row.height);
    if (opts?.arms === 'max') { // longest arms only: every weight that works at max wingspan
      const ok = [];
      for (let w = row.minWeight; w <= row.maxWeight; w++) { const body = { ...mid, weight: w, wingspan: row.maxWingspan }; if (!constrained || capFeasible(body, opts)) ok.push(body); }
      for (const k of pick(0, ok.length - 1, Math.min(frames + 2, ok.length))) if (ok.length) out.push(ok[k]);
      continue;
    }
    if (constrained) {
      const ok = [];
      for (let w = row.minWeight; w <= row.maxWeight; w++) for (let s = row.minWingspan; s <= row.maxWingspan; s++) {
        const body = { ...mid, weight: w, wingspan: s };
        if (capFeasible(body, opts)) ok.push(body);
      }
      const n = frames + 2;
      for (const k of pick(0, ok.length - 1, Math.min(n, ok.length))) if (ok.length) out.push(ok[k]);
      continue;
    }
    const ws = pick(row.minWeight, row.maxWeight, frames), ss = pick(row.minWingspan, row.maxWingspan, frames);
    for (let k = 0; k < ws.length; k++) out.push({ ...mid, weight: ws[k], wingspan: ss[Math.min(k, ss.length - 1)] });
    out.push({ ...mid, weight: row.maxWeight, wingspan: row.minWingspan }, { ...mid, weight: row.minWeight, wingspan: row.maxWingspan });
  }
  if (around) out.unshift(around);
  const seen = new Set();
  return out.filter(b => { const k = [b.position, b.height, b.weight, b.wingspan].join(); return !seen.has(k) && seen.add(k); });
}

// How many bodies could meet these musts/minimums at all (cap check + cheapest must-have plan under 99).
export function countFeasible(positionList, heights, opts) {
  const bodies = bodiesFor(positionList, heights, { frames: 5, opts });
  const required = Object.entries(opts.mustHave ?? {}).filter(([, t]) => t).map(([name, tier]) => ({ badge: byName[name], tier }));
  const category = opts.breakers?.special?.category ?? '';
  const floors = mergeFloors(opts.minimums ?? empty(), category ? specMinimums(category) : empty());
  const pool = { general: (opts.breakers?.general ?? 0) + (opts.breakers?.future ?? 0), special: { category, count: category ? MAX_SPECIALIZED : 0 } };
  let n = 0;
  for (const body of bodies) {
    const ctx = ctxFor(body);
    if (fits(floors, ctx.caps) && cheapestPlan(floors, required, ctx, pool, 2)) n++;
  }
  return n;
}

// Most general Cap Breakers a player can have in a year. 2K hasn't published it; third-party guides count 28 (20 in
// Season 1, one more each later season). 5 per attribute at most.
export const MAX_CAP_BREAKERS = 28;

// Nothing fits with the breakers you have: the fewest total (general now + later) up to MAX_CAP_BREAKERS that lets some
// body meet the musts and minimums, or null.
export function minBreakers(positionList, heights, opts) {
  const have = (opts.breakers?.general ?? 0) + (opts.breakers?.future ?? 0);
  const fitsWith = total => countFeasible(positionList, heights,
    { ...opts, breakers: { ...opts.breakers, general: total - (opts.breakers?.future ?? 0) } }) > 0;
  if (have >= MAX_CAP_BREAKERS || !fitsWith(MAX_CAP_BREAKERS)) return null;
  let lo = have, hi = MAX_CAP_BREAKERS; // lo doesn't fit, hi does
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fitsWith(mid)) hi = mid; else lo = mid; }
  return hi;
}

// Nothing fits: which single must (dropped, or one tier lower) or minimum (removed) opens up the most bodies?
export function blockers(positionList, heights, opts, { onProgress } = {}) {
  const tries = [];
  for (const [name, tier] of Object.entries(opts.mustHave ?? {})) {
    if (!tier) continue;
    const rank = tierRank(tier);
    tries.push({ kind: 'must', name, from: tier, to: null });
    if (rank > 1) tries.push({ kind: 'must', name, from: tier, to: tiers[rank - 2] });
  }
  (opts.minimums ?? []).forEach((v, i) => { if (v > 25) tries.push({ kind: 'min', name: attributes[i].name, index: i, from: v, to: 25 }); });
  const applyAll = list => list.reduce((o, t) => t.kind === 'must' ? { ...o, mustHave: { ...o.mustHave, [t.name]: t.to ?? undefined } }
    : { ...o, minimums: o.minimums.map((v, j) => j === t.index ? 25 : v) }, opts);
  // Single changes first; if none works, pairs (two things are blocking together).
  let out = [];
  tries.forEach((t, n) => {
    onProgress?.({ done: n + 1, total: tries.length, label: 'Finding what blocks the search' });
    const count = countFeasible(positionList, heights, applyAll([t]));
    if (count > 0) out.push({ changes: [t], count });
  });
  if (!out.length) {
    const pairs = [];
    for (let a = 0; a < tries.length; a++) for (let b = a + 1; b < tries.length; b++)
      if (tries[a].name !== tries[b].name) pairs.push([tries[a], tries[b]]);
    pairs.forEach((pair, n) => {
      if (n % 5 === 0) onProgress?.({ done: n + 1, total: pairs.length, label: 'Trying pairs of changes' });
      const count = countFeasible(positionList, heights, applyAll(pair));
      if (count > 0) out.push({ changes: pair, count });
    });
  }
  // Prefer the smallest give-up: tier drops beat removing a badge when they open the same bodies.
  const drops = x => x.changes.filter(c => !c.to || c.kind === 'min').length;
  return out.sort((a, b) => b.count - a.count || drops(a) - drops(b)).slice(0, 6);
}

// Screen bodies: which can hold the musts/minimums at all, and how much room each leaves. Returns the `keep` best.
// Tie-break between frames of one height: how much of the attribute meta (speed first) its caps allow, so a tie doesn't
// default to the heaviest, longest frame (most total cap room, but the slowest).
const metaPotential = (body, caps) => [...Object.entries(attrMetaFor(body.position, body.height)),
  ...Object.entries(FRAME_META[metaGroup(body.position)])].reduce((s, [name, [w, target]]) => s + w * Math.min(caps[idx[name]], target), 0);
export function screenBodies(bodies, opts, { onProgress, keep = 14 } = {}) {
  const required = Object.entries(opts.mustHave ?? {}).filter(([, t]) => t).map(([name, tier]) => ({ badge: byName[name], tier }));
  const category = opts.breakers?.special?.category ?? '';
  const floors = mergeFloors(opts.minimums ?? empty(), category ? specMinimums(category) : empty());
  const pool = { general: (opts.breakers?.general ?? 0) + (opts.breakers?.future ?? 0), special: { category, count: category ? MAX_SPECIALIZED : 0 } };
  const screened = [];
  bodies.forEach((body, n) => {
    if (n % 10 === 0) onProgress?.({ done: n, total: bodies.length, label: 'Screening bodies' });
    const ctx = ctxFor(body);
    if (!fits(floors, ctx.caps)) return;
    const start = cheapestPlan(floors, required, ctx, pool, 2);
    if (start) screened.push({ body, room: 99 - start.plan.ovr, pinned: body === bodies[0] && !!opts.pinFirst,
      potential: metaPotential(body, ctx.caps) });
  });
  // Best frame per height (ties: the frame with the most total cap room), then spread across heights: with few or no
  // requirements every body has the same room, and taking the top N would just be N frames of one height.
  const better = (a, b) => b.pinned - a.pinned || b.room - a.room || b.potential - a.potential;
  screened.sort(better);
  // Up to two frames per height (the best two), then the most meta heights first: the results are the highest meta
  // builds found, not one per height (narrow the heights or positions to look at a specific size).
  // Best frame per height and role (guard / wing / big), then the most meta heights for each role first, so wings and
  // bigs both get looked at. Frame potential is compared within a role (a big's cap list is longer, not better).
  // Up to two frames per height and role; heights far off the meta for their role (under a quarter of the best height's
  // meta, e.g. 5'9" when 6'7" PGs are allowed) are left out unless nothing else is in range.
  const seen = new Map();
  let frames = [];
  for (const x of screened) {
    const k = x.body.height + metaGroup(x.body.position), n = seen.get(k) ?? 0;
    if (n < 2) { seen.set(k, n + 1); frames.push(x); }
  }
  const peak = Math.max(0, ...frames.map(x => heightMeta(x.body.height, x.body.position)));
  const meta = frames.filter(x => x.pinned || heightMeta(x.body.height, x.body.position) >= peak * 0.25);
  if (meta.length) frames = meta;
  const best = {};
  for (const x of frames) { const g = metaGroup(x.body.position); best[g] = Math.max(best[g] ?? 0, x.potential); }
  const top = frames[0]?.room ?? 0;
  const rank = x => heightMeta(x.body.height, x.body.position) + 0.05 * x.potential / best[metaGroup(x.body.position)];
  const chosen = frames.filter(x => x.pinned || x.room >= top - 3).sort((a, b) => b.pinned - a.pinned || rank(b) - rank(a)).slice(0, keep);
  for (const x of frames) { if (chosen.length >= keep) break; if (!chosen.includes(x)) chosen.push(x); }
  return { chosen, screened: screened.length, bodies: bodies.length };
}

// Archetypes worth trying for a body, given a first (natural) result: an archetype is promising when the attributes
// this build leans on have low weights in it, because that's what makes Cap Breakers jump further (e.g. a 6'8"
// pushed into another archetype by an 81 standing dunk: three point and steal breakers go +5/+4 instead of +2/+1).
export function archetypeCandidates(r, n = 3) {
  const h = r.body.height;
  const need = r.final.map((v, i) => Math.max(0, (r.targets?.[i] ?? v) - 60));
  const potency = type => {
    const w = typeWeights(h, type), max = Math.max(...w);
    return need.reduce((s, x, i) => s + x * (max - w[i]) / max, 0);
  };
  const natural = r.playerType;
  const base = potency(natural);
  const list = [];
  for (let type = 0; type < playerTypeCount(h); type++) if (type !== natural) list.push({ type, gain: potency(type) - base });
  return list.filter(x => x.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, n).map(x => x.type);
}

// Choosing between a body's natural archetype and forced ones: your picks score plus ARCH_META per meta point. Picks
// alone can't see the meta score's gates (e.g. under-78 three), so two archetypes within a point on picks can be 20
// meta apart (a 6'6" SG with 99 dunk / 90 vertical / 80 steal: #11 meta 37 vs #7 meta 57). Only switch for a real
// gain (half a point ≈ half a Normal badge tier).
export const ARCH_META = 0.25;
// With no picks of your own (every badge on Don't care, no feel attributes) the search is a pure meta search: the picks
// score is just meta badge worth without height or the meta gates, so it ranked 6'8" centers with more cap room over a
// 6'11" one the meta score puts on top. There the meta score leads (META_ONLY per point).
export const META_ONLY = 1.5;
export const pureMeta = opts => !Object.entries(opts?.values ?? {}).some(([, v]) => v > 0) && !(opts?.continuous ?? []).length;
export const archMetaRate = opts => pureMeta(opts) ? META_ONLY : ARCH_META;
export const archetypeScore = (r, body, opts) => r.value + (metaRate(opts) > 0 ? archMetaRate(opts) * metaScore(r.final, body.height, body.position, opts.mode, nearOf(r)) : 0);
export function pickArchetype(first, alts, body, opts) {
  return [first, ...alts].reduce((a, b) => archetypeScore(b, body, opts) > archetypeScore(a, body, opts) + 0.5 ? b : a);
}

// Frames right next to a result where a cap opens a breakpoint the build just misses: what people do by hand, pushing
// the weight (or wingspan) until they *just* get the attribute they want and keep everything else. E.g. a 6'11" C one
// pound heavier for a 95 defensive rebound cap (Possession Closer gold). Only breakpoints worth something to the meta
// (badge tiers worth ≥ 1 at this position, attribute meta targets and floors). Nearest bodies first, one per opening.
export function nudgeBodies(r, n = 3) {
  const row = positions[r.body.position]?.find(x => x.height === r.body.height);
  if (!row) return [];
  const h = r.body.height, pos = r.body.position, caps0 = capsFor(r.body);
  // attribute → { breakpoint: meta worth of reaching it } (badge tier worth, or an attribute meta target/floor).
  const marks = new Map();
  const add = (i, m, worth) => { if (!marks.has(i)) marks.set(i, new Map()); marks.get(i).set(m, Math.max(marks.get(i).get(m) ?? 0, worth)); };
  for (const g of goals) if (inHeight(g, h) && metaOf(g, pos) >= 1)
    g.tiers.forEach((t, k) => { if (k < metaCap(g, pos)) for (const q of t.requirements)
      add(q.attribute ?? idx[q.name], q.minimum, metaOf(g, pos) * (metaTierWorth(g, k + 1) - metaTierWorth(g, k))); });
  for (const [name, [w, target, floor]] of Object.entries(attrMetaFor(pos, h))) { add(idx[name], target, 2 * w); if (floor) add(idx[name], floor, 4 * w); }
  // The nearest frame (weight first, then an inch of wingspan) that opens each breakpoint, up to 30 lb either way.
  const moves = [];
  for (let dw = 1; dw <= 30; dw++) for (const sw of [1, -1]) for (const da of [0, 1, -1]) moves.push([sw * dw, da]);
  for (const da of [1, -1]) moves.unshift([0, da]);
  moves.sort((a, b) => Math.abs(a[0]) + 4 * Math.abs(a[1]) - (Math.abs(b[0]) + 4 * Math.abs(b[1])));
  const nearest = new Map(); // "i:m" → { body, opens: [...] }
  for (const [dw, da] of moves) {
    const body = { ...r.body, weight: r.body.weight + dw, wingspan: r.body.wingspan + da };
    if (body.weight < row.minWeight || body.weight > row.maxWeight || body.wingspan < row.minWingspan || body.wingspan > row.maxWingspan) continue;
    const caps = capsFor(body);
    for (const [i, ms] of marks) for (const [m, worth] of ms) {
      const key = i + ':' + m;
      if (nearest.has(key) || !(r.final[i] < m && caps0[i] < m && caps[i] >= m)) continue;
      nearest.set(key, { body, open: { i, m, worth } });
    }
  }
  // One candidate per body (everything it opens), most meta worth first, nearest on ties.
  const byBody = new Map();
  for (const { body, open } of nearest.values()) {
    const k = body.weight + '/' + body.wingspan;
    if (!byBody.has(k)) byBody.set(k, { body, opens: [] });
    byBody.get(k).opens.push(open);
  }
  const dist = b => Math.abs(b.weight - r.body.weight) + 4 * Math.abs(b.wingspan - r.body.wingspan);
  return [...byBody.values()].map(c => ({ ...c, worth: c.opens.reduce((s, o) => s + o.worth, 0) }))
    .sort((a, b) => b.worth - a.worth || dist(a.body) - dist(b.body)).slice(0, n)
    .map(({ body, opens }) => ({ body, opens: opens.map(({ i, m }) => ({ i, m })) }));
}

// One body, searched properly: the natural archetype plus the most promising forced ones, each a full badge-first
// optimization. Returns the best, with the others as alternatives.
export function optimizeBodyFull(body, opts, { pinned = false } = {}) {
  const first = optimizeBody(body, { ...opts, refine: opts.refine || pinned, seeds: opts.seeds ?? 3 });
  if (first.error || opts.archetypes === false) return first;
  // Forced archetypes reuse the winning seed (the restarts only run on the natural archetype, to keep this fast).
  const seeded = first.seed ? { ...opts.mustHave, [first.seed.name]: first.seed.tier } : opts.mustHave;
  const alts = [], beat = archetypeScore(first, body, opts);
  for (const type of archetypeCandidates(first, opts.archetypeTries ?? 3)) {
    const alt = optimizeBody(body, { ...opts, mustHave: seeded, forceType: type, beat });
    if (!alt.error) alts.push({ ...alt, forcedType: type });
  }
  const best = pickArchetype(first, alts, body, opts);
  return best === first ? first : { ...best, archetypeTrick: true, naturalValue: first.value };
}

// Polishing a leading build (iterated local search): the greedy optimizer climbs one breakpoint at a time and can stop
// at a different arrangement than the best for the tiers it reached; re-planning with those tiers held (what the
// Builder's Re-optimize does) or solving exactly around the build often finds a better one.
// type: an archetype index (re-plan as that archetype with every worthwhile tier the build holds kept), null (the same,
// natural archetype) or 'mip' (exact plan within a few points of the build, same archetype; needs the solver loaded).
export function polishMusts(r, opts) {
  const o = { ...opts, position: r.body.position, height: r.body.height };
  const must = { ...opts.mustHave };
  for (const g of goals) {
    if (worthOf(o, g) <= 0 || !inHeight(g, r.body.height)) continue;
    const rank = Math.min(tierRank(badgeTier(g, r.final, r.body.height)), tierCapOf(o, g), opts.exclude?.[g.name] ?? 4);
    if (rank > tierRank(must[g.name])) must[g.name] = tiers[rank - 1];
  }
  return must;
}
export const POLISH_RADIUS = 6;
export function polishPlan(r, opts, type = null) {
  if (type === 'mip') {
    const x = mipBody(r.body, { ...opts, mipRadius: opts.mipRadius ?? POLISH_RADIUS }, r.playerType, r);
    return x ?? { error: mipReady() ? 'No better exact plan.' : 'Exact planner not loaded.' };
  }
  return optimizeBody(r.body, { ...opts, mustHave: polishMusts(r, opts), seeds: 0, archetypes: false, ...(type != null ? { forceType: type } : {}) });
}

export const rankPlans = (results, opts) => {
  const continuous = (opts.continuous ?? []).map(k => idx[k] ?? k);
  const physical = r => continuous.reduce((s, i) => s + r.final[i], 0);
  // Picks + meta (archetypeScore): picks alone can't see the meta score's height and gates, so with mostly-meta prefs the
  // leaders polished and nudged weren't the builds shown on top (sorted by meta). Scores computed once per plan.
  const score = new Map(results.map(r => [r, archetypeScore(r, r.body, opts)]));
  return results.sort((a, b) => score.get(b) - score.get(a) || physical(b) - physical(a));
};

// Optimize many bodies (single thread; the Lab spreads optimizeBodyFull across workers instead).
export function optimizeAcross(bodies, opts, { onProgress, keep = 14 } = {}) {
  const { chosen, screened, bodies: total } = screenBodies(bodies, opts, { onProgress, keep });
  const results = chosen.map(({ body, pinned }, n) => {
    onProgress?.({ done: n + 1, total: chosen.length, label: 'Optimizing' });
    return optimizeBodyFull(body, opts, { pinned });
  }).filter(r => !r.error);
  return { results: rankPlans(results, opts), screened, bodies: total };
}
