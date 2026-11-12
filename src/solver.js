// Build solver: finds base ratings (and Cap Breaker plans) that satisfy rating floors and badge
// tiers on a body, then spends the remaining Overall budget on weighted priorities.
// The in-game builder requires every build to be filled to 99 Overall, so "budget" here means
// how the 99 is spent, not how much is left over.
import { alternatives, attributes, badgeTier, badges, capsFor, defaultBody, inHeight, ladder, mergeFloors,
  overall, overallAs, playerTypeCount, positions, resolveLinks, tiers } from './engine.js';

const N = attributes.length;
const LIMIT = 99 + 1e-8;
export const tierRank = tier => tier ? tiers.indexOf(tier) + 1 : 0;

export function clampLinks(manual, height, caps) {
  return resolveLinks(manual, height).map((value, i) => Math.min(value, caps[i]));
}

function ctxFor(body) {
  return { body, h: body.height, caps: capsFor(body) };
}

const score = (ratings, h) => overall(ratings, h);

// Smallest base rating whose first k breakers reach target (null if impossible).
function baseForTarget(i, target, k, ctx, playerType) {
  for (let b = 25; b <= Math.min(target, ctx.caps[i]); b++) {
    const gains = ladder(i, b, ctx.caps[i], ctx.h, playerType).slice(0, k);
    if (b + gains.reduce((s, g) => s + g, 0) >= target) return b;
  }
  return null;
}

export function finalsFor(base, breakers, ctx) {
  const { playerType } = score(base, ctx.h);
  return base.map((rating, i) => rating + ladder(i, rating, ctx.caps[i], ctx.h, playerType)
    .slice(0, breakers[i]).reduce((s, g) => s + g, 0));
}

function isEligible(i, special) {
  return special.category && (attributes[i].discipline === special.category || attributes[i].name === 'free_throw');
}

// Satisfy final-rating targets on one body, using breakers where they save the most Overall.
export function satisfy(targets, ctx, pool = {}) {
  const plan = satisfyNatural(targets, ctx, pool);
  if (plan || !(pool.general || pool.special?.count) || targets.some((t, i) => t > ctx.caps[i])) return plan;
  // Breaker gains depend on the player type, and planning from the all-base starting point locks in whatever archetype
  // that is (often a poor one for breakers). If it doesn't fit, plan for each archetype and keep the cheapest that does.
  let best = null;
  for (let type = 0; type < playerTypeCount(ctx.h); type++) {
    const p = satisfyAs(targets, ctx, pool, type);
    if (p && (!best || p.ovr < best.ovr)) best = p;
  }
  return best;
}

function satisfyNatural(targets, ctx, { general = 0, special = { category: '', count: 0 } } = {}) {
  // Breakers never raise a rating past the body's physical cap.
  if (targets.some((t, i) => t > ctx.caps[i])) return null;
  const k = new Array(N).fill(0);
  let floors = [...targets];
  let generalLeft = general, specialLeft = special.count ?? 0;
  let manual = floors;
  let base = clampLinks(manual, ctx.h, ctx.caps);
  let current = score(base, ctx.h);
  if (!generalLeft && !specialLeft) return pack();

  for (let round = 0; round < general + (special.count ?? 0); round++) {
    let best = null;
    for (let i = 0; i < N; i++) {
      if (targets[i] <= 25 || k[i] >= 5) continue;
      const useSpecial = specialLeft > 0 && isEligible(i, special);
      if (!useSpecial && generalLeft <= 0) continue;
      const b = baseForTarget(i, targets[i], k[i] + 1, ctx, current.playerType);
      if (b == null || b >= floors[i]) continue;
      const trialFloors = floors.map((f, j) => j === i ? b : f);
      const trial = clampLinks(trialFloors, ctx.h, ctx.caps);
      const s = score(trial, ctx.h);
      const saving = current.score - s.score;
      if (saving > 1e-9 && (!best || saving > best.saving)) best = { i, b, trialFloors, s, saving, useSpecial };
    }
    if (!best) break;
    k[best.i]++;
    floors = best.trialFloors;
    current = best.s;
    if (best.useSpecial) specialLeft--; else generalLeft--;
  }
  manual = floors;
  base = clampLinks(manual, ctx.h, ctx.caps);
  return pack();

  function pack() {
    const s = score(base, ctx.h);
    if (s.score > LIMIT) return null;
    const final = finalsFor(base, k, ctx);
    if (final.some((v, i) => v < targets[i])) return null;
    return { manual: [...manual], base, breakers: [...k], final, ovr: s.score, playerType: s.playerType,
      generalUsed: general - generalLeft, specialUsed: (special.count ?? 0) - specialLeft };
  }
}

// Like satisfy, but plans every Cap Breaker with one archetype's gains, then raises the cheapest base ratings until the
// build really is that archetype (its player type). Breaker gains depend on the player type — an attribute with a low
// weight in the active archetype gains much more per breaker — so pushing the build into another archetype (e.g. an
// 81 standing dunk on a 6'8") can make breakers elsewhere jump further. Returns null if it can't get there under 99.
// preset ({ attributeIndex: count }, optional): breakers reserved for those attributes before the greedy pick (the
// Breaker Hunt keeps its breakers on the attributes you picked even when another spot would save a bit more Overall).
export function satisfyAs(targets, ctx, { general = 0, special = { category: '', count: 0 }, preset = null } = {}, type) {
  if (targets.some((t, i) => t > ctx.caps[i])) return null;
  const k = new Array(N).fill(0);
  let floors = [...targets];
  let generalLeft = general, specialLeft = special.count ?? 0;
  for (const [key, n] of Object.entries(preset ?? {})) {
    const i = Number(key), take = Math.min(n, generalLeft, 5);
    if (take <= 0 || targets[i] <= 25) continue;
    const b = baseForTarget(i, targets[i], take, ctx, type);
    if (b == null) continue;
    k[i] = take; floors[i] = Math.min(floors[i], b); generalLeft -= take;
  }
  // Each breaker is picked by what it takes off the real Overall (the best archetype's score), not just `type`'s: lowering
  // a base rating the leading archetype weighs heavily (e.g. steal under a lockdown type) is what lets `type` take over.
  // Ties (the leader didn't move) go to the biggest drop in `type`'s own score.
  const both = f => { const b = clampLinks(f, ctx.h, ctx.caps); return [score(b, ctx.h).score, overallAs(b, ctx.h, type)]; };
  let [cur, curAs] = both(floors);
  const rounds = generalLeft + specialLeft;
  for (let round = 0; round < rounds; round++) {
    let best = null;
    for (let i = 0; i < N; i++) {
      if (targets[i] <= 25 || k[i] >= 5) continue;
      const useSpecial = specialLeft > 0 && isEligible(i, special);
      if (!useSpecial && generalLeft <= 0) continue;
      const b = baseForTarget(i, targets[i], k[i] + 1, ctx, type);
      if (b == null || b >= floors[i]) continue;
      const trialFloors = floors.map((f, j) => j === i ? b : f);
      const [s, sAs] = both(trialFloors);
      const saving = cur - s, own = curAs - sAs;
      if (saving < -1e-9 || (saving <= 1e-9 && own <= 1e-9)) continue;
      const key = Math.max(0, saving) * 1e3 + own;
      if (!best || key > best.key) best = { i, trialFloors, s, sAs, key, useSpecial };
    }
    if (!best) break;
    k[best.i]++; floors = best.trialFloors; cur = best.s; curAs = best.sAs;
    if (best.useSpecial) specialLeft--; else generalLeft--;
  }
  // Make `type` the player type: raise whichever base rating closes the gap to the leading archetype fastest.
  let manual = [...floors], base = clampLinks(manual, ctx.h, ctx.caps);
  for (let guard = 0; guard < 300; guard++) {
    const s = score(base, ctx.h);
    if (s.score > LIMIT) return null;
    if (s.playerType === type) break;
    const gap0 = s.score - overallAs(base, ctx.h, type);
    let best = null;
    for (let i = 0; i < N; i++) {
      if (base[i] >= ctx.caps[i]) continue;
      const trialManual = manual.map((v, j) => j === i ? Math.max(v, base[j]) + 1 : v);
      const trial = clampLinks(trialManual, ctx.h, ctx.caps);
      const ts = score(trial, ctx.h);
      const closed = gap0 - (ts.score - overallAs(trial, ctx.h, type));
      const cost = ts.score - s.score;
      if (closed > 1e-9 && (!best || closed / Math.max(1e-4, cost) > best.r)) best = { trialManual, trial, r: closed / Math.max(1e-4, cost) };
    }
    if (!best) return null;
    manual = best.trialManual; base = best.trial;
  }
  const s = score(base, ctx.h);
  if (s.playerType !== type || s.score > LIMIT) return null;
  const final = finalsFor(base, k, ctx);
  if (final.some((v, i) => v < targets[i])) return null;
  return { manual: [...manual], base, breakers: [...k], final, ovr: s.score, playerType: s.playerType,
    generalUsed: general - generalLeft, specialUsed: (special.count ?? 0) - specialLeft };
}

// Spend the remaining Overall budget greedily on weighted attributes. ceiling: highest base per attribute (a number
// or an array). floors (optional): final ratings that
// must keep holding — raising one rating can change the player type and shrink Cap Breaker gains elsewhere.
export function fill(plan, weights, ctx, locked = [], floors = null, ceiling = 99) {
  let manual = [...plan.manual];
  let base = clampLinks(manual, ctx.h, ctx.caps);
  let ovr = score(base, ctx.h).score;
  const active = weights.map((w, i) => w > 0 && !locked[i] ? i : -1).filter(i => i >= 0);
  if (!active.length) return plan;
  for (const step of [6, 2, 1]) {
    for (let guard = 0; guard < 400; guard++) {
      let best = null;
      for (const i of active) {
        const top = Math.min(ctx.caps[i], Array.isArray(ceiling) ? ceiling[i] : ceiling);
        if (base[i] >= top) continue;
        const trialManual = [...manual];
        trialManual[i] = Math.min(top, Math.max(manual[i], base[i]) + step);
        const trial = clampLinks(trialManual, ctx.h, ctx.caps);
        const s = score(trial, ctx.h).score;
        if (s > LIMIT) continue;
        if (floors && finalsFor(trial, plan.breakers, ctx).some((v, j) => v < floors[j])) continue;
        // Count what the final ratings gain (a base raise that only squashes a Cap Breaker's gain is worth nothing).
        const before = finalsFor(base, plan.breakers, ctx), after = finalsFor(trial, plan.breakers, ctx);
        let gain = 0;
        for (let j = 0; j < N; j++) gain += weights[j] * (after[j] - before[j]);
        const value = gain / Math.max(1e-4, s - ovr);
        if (gain > 0 && (!best || value > best.value)) best = { trialManual, trial, s, value };
      }
      if (!best) break;
      manual = best.trialManual; base = best.trial; ovr = best.s;
    }
  }
  const { playerType } = score(base, ctx.h);
  const final = finalsFor(base, plan.breakers, ctx);
  return { ...plan, manual, base, final, ovr, playerType };
}

export function badgeSummary(final, height) {
  const unlocked = [];
  for (const badge of badges) {
    const tier = badgeTier(badge, final, height);
    if (tier) unlocked.push({ badge: badge.badge, name: badge.name, tier });
  }
  return { unlocked, points: unlocked.reduce((s, b) => s + tierRank(b.tier), 0) };
}

// OR-branches of all requested badge tiers merged with attribute targets.
export function targetBranches(goals, badgeGoals, height, max = 24) {
  let branches = [goals];
  for (const { badge, tier } of badgeGoals) {
    if (!inHeight(badge, height)) return [];
    const options = alternatives(badge.tiers.find(t => t.tier === tier));
    const merged = new Map();
    for (const b of branches) for (const o of options) {
      const m = mergeFloors(b, o);
      merged.set(m.join(','), m);
    }
    branches = [...merged.values()].sort((a, b) => sum(a) - sum(b)).slice(0, max);
  }
  return branches;
}
const sum = values => values.reduce((s, v) => s + v, 0);

export function framesFor(position, { heights, thorough = false } = {}) {
  const frames = [];
  for (const row of positions[position]) {
    if (heights && (row.height < heights[0] || row.height > heights[1])) continue;
    const mid = defaultBody(position, row.height);
    const weightSteps = thorough ? 5 : 3, wingSteps = thorough ? 4 : 3;
    const pick = (lo, hi, n) => [...new Set(Array.from({ length: n }, (_, k) => Math.round(lo + (hi - lo) * k / (n - 1))))];
    for (const weight of pick(row.minWeight, row.maxWeight, weightSteps))
      for (const wingspan of pick(row.minWingspan, row.maxWingspan, wingSteps))
        frames.push({ ...mid, weight, wingspan });
  }
  return frames;
}

const objective = (final, weights) => final.reduce((s, v, i) => s + weights[i] * v, 0);

// Similarity on how far above the floor each rating sits.
export function similarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - 25, y = b[i] - 25;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Searches bodies for builds.
 * options: { positions, heights:[lo,hi], thorough, goals:number[21], badgeGoals:[{badge,tier}],
 *   weights:number[21], breakers:{general, special:{category,count}}, reference?:number[21],
 *   limit, onProgress }
 */
export function search(options) {
  const { goals = attributes.map(() => 25), badgeGoals = [], weights = attributes.map(() => 1),
    breakers = { general: 0, special: { category: '', count: 0 } }, reference = null, limit = 12,
    onProgress } = options;
  const selected = options.positions?.length ? options.positions : Object.keys(positions);
  const frames = selected.flatMap(p => framesFor(p, options));
  const shortlist = [];
  let checked = 0, feasible = 0;
  frames.forEach((body, index) => {
    const ctx = ctxFor(body);
    let best = null;
    for (const branch of targetBranches(goals, badgeGoals, body.height)) {
      checked++;
      const plan = satisfy(branch, ctx, breakers);
      if (plan && (!best || plan.ovr < best.ovr)) best = plan;
    }
    if (best) { feasible++; shortlist.push({ body, plan: best }); }
    if (onProgress && index % 25 === 0) onProgress({ done: index + 1, total: frames.length });
  });
  // Fewer Overall points used on the requirements = more room for priorities. Fill the most promising.
  shortlist.sort((a, b) => a.plan.ovr - b.plan.ovr);
  const pool = shortlist.slice(0, Math.max(limit * 6, 60)).map(({ body, plan }) => {
    const ctx = ctxFor(body);
    const filled = fill(plan, weights, ctx, goals.map(() => false));
    const match = reference ? similarity(filled.final, reference) : null;
    const value = reference ? match * 1000 + objective(filled.final, weights) / 100 : objective(filled.final, weights);
    return { body, ...filled, value, similarity: match, badges: badgeSummary(filled.final, body.height) };
  });
  pool.sort((a, b) => b.value - a.value);
  // Identical frames at different positions produce identical ratings: merge them, then keep variety
  // (at most two results per height).
  const merged = new Map();
  for (const r of pool) {
    const key = [r.body.height, r.body.weight, r.body.wingspan, r.final.join(',')].join('|');
    const hit = merged.get(key);
    if (hit) { if (!hit.alsoPositions.includes(r.body.position)) hit.alsoPositions.push(r.body.position); }
    else merged.set(key, { ...r, alsoPositions: [] });
  }
  const seen = new Map(), results = [];
  for (const r of merged.values()) {
    const key = r.body.height;
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    results.push(r);
    if (results.length >= limit) break;
  }
  return { results, checked, frames: frames.length, feasible };
}

// Cheapest way (fewest Overall points) to reach a badge tier on one body, ignoring everything else.
export function cheapestBadge(badge, tier, body) {
  const ctx = ctxFor(body);
  let best = null;
  for (const branch of targetBranches(attributes.map(() => 25), [{ badge, tier }], body.height)) {
    const plan = satisfy(branch, ctx);
    if (plan && (!best || plan.ovr < best.ovr)) best = plan;
  }
  return best;
}
