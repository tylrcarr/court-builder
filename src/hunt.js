// Breaker Hunt: pick the attributes you want Cap Breakers to carry, find the archetype (player type) that lets them
// carry the most, and builds that really are that archetype. Each breaker step is bigger when the active archetype
// weighs that attribute lightly (see engine.ladder), so the same 5 breakers can add +5 under one archetype and +18
// under another. Lightly weighted also means the base rating is cheap in Overall.
import { attributes, capsFor, defaultBody, ladder, playerTypeCount, positions, typeWeights } from './engine.js';
import { MAX_CAP_BREAKERS, MAX_SPECIALIZED, bodiesFor, metaScore, nearOf, optimizeBody, specMinimums } from './breakpoints.js';
import { satisfyAs } from './solver.js';
import { metaGroup } from './meta.js';

export const STEPS = 5; // breakers per attribute (the game's limit)
const ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];

// Lowest base from which `n` breakers reach `target` under `type`, and what they add from there. Steps shrink as the
// rating climbs, so reaching 90 can take +13 where reaching the cap (98) only gets +7.
const reachMemo = new Map();
export function reach(i, target, cap, height, type, n = STEPS) {
  const key = `${i},${target},${cap},${height},${type},${n}`;
  if (!reachMemo.has(key)) reachMemo.set(key, reachRaw(i, target, cap, height, type, n));
  return reachMemo.get(key);
}
function reachRaw(i, target, cap, height, type, n) {
  target = Math.min(target, cap);
  for (let b = 25; b < target; b++) {
    const steps = ladder(i, b, cap, height, type).slice(0, n);
    if (b + steps.reduce((s, g) => s + g, 0) >= target) {
      const used = []; let r = b;
      for (const g of steps) { if (r >= target) break; used.push(g); r += g; }
      return { base: b, gain: target - b, steps: used };
    }
  }
  return { base: target, gain: 0, steps: [] };
}
// Pick targets: { attributeIndex: final rating wanted } (missing/0 = the body's cap).
const targetOf = (targets, i, caps) => Math.min(caps[i], targets?.[i] || caps[i]);

// What an archetype is built around: its most heavily weighted attributes (those must be high for it to lead).
export function heavyOf(height, type, k = 4) {
  const w = typeWeights(height, type), m = Math.max(...w);
  return w.map((x, i) => [i, x / m]).sort((a, b) => b[1] - a[1]).slice(0, k).map(([i]) => i);
}
export const weightOf = (height, type, i) => { const w = typeWeights(height, type); return w[i] / Math.max(...w); };

// Every archetype for this body, ranked by the breaker points the picks get (5 breakers each, from the lowest base).
export function archetypeTable(picks, body, targets = {}) {
  const caps = capsFor(body), h = body.height;
  const rows = [];
  for (let type = 0; type < playerTypeCount(h); type++) {
    const per = picks.map(i => ({ i, cap: caps[i], target: targetOf(targets, i, caps), weight: weightOf(h, type, i),
      ...reach(i, targetOf(targets, i, caps), caps[i], h, type) }));
    rows.push({ type, per, total: per.reduce((s, p) => s + p.gain, 0), heavy: heavyOf(h, type) });
  }
  return rows.sort((a, b) => b.total - a.total || a.type - b.type);
}

// Average a breaker adds to each pick under an archetype; "great" = every pick averages at least `minStep` (so an
// archetype that gives one of them +1s is out).
export const perBreaker = p => p.steps.length ? p.gain / p.steps.length : 0;
export const isGreat = (row, minStep = 0) => row.per.every(p => p.gain > 0 && perBreaker(p) >= minStep);
export const greatRows = (picks, body, targets = {}, minStep = 0) => archetypeTable(picks, body, targets).filter(r => isGreat(r, minStep));

// For each attribute not picked yet: the best total the picks would get with it added, counting only archetypes that
// are great for all of them (null = picked already; 0 = no archetype is great for that combination).
export function nextPickHints(picks, body, targets = {}, minStep = 0) {
  return attributes.map((_, i) => picks.includes(i) ? null : greatRows([...picks, i], body, targets, minStep)[0]?.total ?? 0);
}

// The same across every position/height you're searching (a mid frame each). Archetype weights change with height and
// caps with the body, so one preview body can hide an archetype that only works a few inches taller.
export function rangeBodies(positionList, heights) {
  // Archetype weights depend only on height, and positions at a height differ only in weight range, so the table uses
  // frames per height rather than per position: the middle weight of every position's range combined, at the short,
  // middle and long wingspan (wingspan moves caps a lot: at 6'6" only a 7'0" wingspan reaches 99 Driving Dunk). Each is
  // labelled with the positions it's legal at.
  const out = [];
  for (let h = heights[0]; h <= heights[1]; h++) {
    const rows = positionList.map(p => [p, positions[p].find(r => r.height === h)]).filter(([, r]) => r);
    if (!rows.length) continue;
    const lo = k => Math.min(...rows.map(([, r]) => r[k])), hi = k => Math.max(...rows.map(([, r]) => r[k]));
    const weight = Math.round((lo('minWeight') + hi('maxWeight')) / 2);
    const spans = [...new Set([lo('minWingspan'), Math.round((lo('minWingspan') + hi('maxWingspan')) / 2), hi('maxWingspan')])];
    for (const wingspan of spans) {
      const legal = positionsFor({ height: h, weight, wingspan });
      out.push({ height: h, weight, wingspan, position: legal[0] ?? rows[0][0], legal });
    }
  }
  return out;
}
// One row per height and archetype (its best frame: highest targets reached, then most breaker points), best first,
// with the frame used and the positions it's legal at.
export function tableAcross(picks, bodies, targets = {}, minStep = 0) {
  const best = new Map();
  const reached = r => r.per.reduce((s, p) => s + p.target, 0);
  for (const body of bodies) for (const row of greatRows(picks, body, targets, minStep)) {
    const key = body.height + ',' + row.type, have = best.get(key);
    const cand = { ...row, height: body.height, weight: body.weight, wingspan: body.wingspan, positions: body.legal ?? [body.position] };
    if (!have || reached(cand) > reached(have) || (reached(cand) === reached(have) && cand.total > have.total)) best.set(key, cand);
  }
  return [...best.values()].sort((a, b) => reached(b) - reached(a) || b.total - a.total || a.height - b.height);
}
export function hintsAcross(picks, bodies, targets = {}, minStep = 0) {
  const best = attributes.map((_, i) => picks.includes(i) ? null : 0);
  for (const body of bodies) nextPickHints(picks, body, targets, minStep).forEach((v, i) => { if (v != null && v > best[i]) best[i] = v; });
  return best;
}
// Highest cap each attribute reaches across the bodies (the pick targets' default).
export const capsAcross = bodies => attributes.map((_, i) => Math.max(25, ...bodies.map(b => capsFor(b)[i])));

// Breakers a plan needs for the stats you asked for (picks and requirements), not ones it parks elsewhere.
const usesOn = (plan, list) => [...new Set(list)].reduce((s, i) => s + plan.breakers[i], 0);
// Two budgets per hunt: the breakers you have now, and up to a year's worth (MAX_CAP_BREAKERS) for versions that need
// more but end up with better stats. Each build says how many it needs.
const poolFor = (breakers, general) => {
  const category = breakers?.special?.category ?? '';
  return { general, special: { category, count: category ? MAX_SPECIALIZED : 0 } };
};

// Can this body be `type` with the picks at their targets (finals)? If not, gives up 3 points on one pick at a time
// (whichever keeps the most), so one hard target doesn't drag the others down; all three only if no single one works.
function lockIn(body, picks, want, type, pool, need = {}) {
  const caps = capsFor(body), ctx = { body, h: body.height, caps };
  const floor = specMinimums(pool.special.category).map((v, i) => Math.max(v, need[i] ?? 0));
  if (floor.some((v, i) => v > caps[i])) return null;
  const goal = Object.fromEntries(picks.map(i => [i, targetOf(want, i, caps)]));
  const tryWith = cur => {
    const targets = attributes.map((_, i) => Math.max(floor[i], cur[i] ?? 25));
    const plan = satisfyAs(targets, ctx, pool, type);
    return plan && { plan, targets };
  };
  let cur = { ...goal };
  for (let round = 0; round < 6; round++) {
    const hit = tryWith(cur);
    if (hit) return { ...hit, under: picks.reduce((s, i) => s + goal[i] - cur[i], 0) };
    let next = null;
    for (const i of picks) {
      const one = { ...cur, [i]: cur[i] - 3 };
      if (tryWith(one)) { next = one; break; }
    }
    cur = next ?? Object.fromEntries(picks.map(i => [i, cur[i] - 3]));
  }
  return null;
}

// Exactly the targets (no lowering) with `general` breakers, or null.
function hitsTargets(body, picks, want, type, pool, need) {
  const caps = capsFor(body), ctx = { body, h: body.height, caps };
  const floor = specMinimums(pool.special.category).map((v, i) => Math.max(v, need[i] ?? 0));
  const targets = attributes.map((_, i) => Math.max(floor[i], picks.includes(i) ? targetOf(want, i, caps) : 25));
  if (targets.some((t, i) => t > caps[i])) return null;
  const plan = satisfyAs(targets, ctx, pool, type);
  return plan && { plan, targets, under: 0 };
}
// Fewest general breakers (above `from`, up to a year's max) that hit every target exactly, by binary search.
function fewestToHit(body, picks, want, type, breakers, need, from) {
  let lo = from + 1, hi = MAX_CAP_BREAKERS, best = null;
  if (lo > hi || !hitsTargets(body, picks, want, type, poolFor(breakers, hi), need)) return null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, hit = hitsTargets(body, picks, want, type, poolFor(breakers, mid), need);
    if (hit) { best = { ...hit, general: mid }; hi = mid - 1; } else lo = mid + 1;
  }
  return best;
}

// Screen bodies × their best-fitting archetypes for ones that can actually be locked in under 99 Overall, with the
// breakers you have ("now"; if the targets don't fit it gets as close as it can). When that falls short of your
// targets, also the fewest extra breakers that hit them exactly ("later"); never a bigger build that still misses.
export function huntScreen(positionList, heights, picks, want, breakers, { perBody = 4, minStep = 0, need = {}, onProgress } = {}) {
  const have = breakers?.general ?? 0;
  const bodies = bodiesFor(positionList, heights, { frames: 3 });
  const asked = [...picks, ...Object.keys(need).map(Number)];
  const found = [];
  const entry = (body, type, hit, when) => ({ body, type, when, targets: hit.targets, under: hit.under,
    goal: Object.fromEntries(picks.map(i => [i, targetOf(want, i, capsFor(body))])),
    // General breakers it needs for what you asked for (picks / requirements); specialization breakers come on top.
    uses: Math.min(usesOn(hit.plan, asked), hit.plan.generalUsed),
    preset: Object.fromEntries(picks.map(i => [i, hit.plan.breakers[i]]).filter(([, n]) => n > 0)),
    // How close the picks get to what you asked for (overshoot doesn't count; a frame with a lower cap does).
    picked: picks.reduce((s, i) => s + Math.min(hit.plan.final[i], want?.[i] || 99), 0),
    gained: picks.reduce((s, i) => s + hit.plan.final[i] - hit.plan.base[i], 0), room: 99 - hit.plan.ovr });
  bodies.forEach((body, n) => {
    for (const row of greatRows(picks, body, want, minStep).slice(0, perBody)) {
      const nowHit = lockIn(body, picks, want, row.type, poolFor(breakers, have), need);
      const now = nowHit && entry(body, row.type, nowHit, 'now');
      if (now) found.push(now);
      if (now && now.under === 0) continue; // already hits every target with what you have
      const laterHit = fewestToHit(body, picks, want, row.type, breakers, need, have);
      if (laterHit) found.push({ ...entry(body, row.type, laterHit, 'later'), uses: laterHit.general });
    }
    onProgress?.({ done: n + 1, total: bodies.length });
  });
  return { found, screened: bodies.length };
}

// Every position whose body range allows this exact height, weight and wingspan. Caps (and so the build) don't depend
// on position, so a 6'10" 250 lb SF is just as much a PF or C build when those ranges include it.
export const positionsFor = body => ORDER.filter(p => positions[p]?.some(r => r.height === body.height
  && body.weight >= r.minWeight && body.weight <= r.maxWeight && body.wingspan >= r.minWingspan && body.wingspan <= r.maxWingspan));

// Best screened candidates: closest to your targets first, then most breaker points on the picks, then Overall room
// left for the rest of the build. Candidates with the same height, wingspan and archetype are one family (same breaker
// steps); each family comes with the frames worth building (see framesOf) and the best of them wins.
// At most `perHeight` families per height.
export function pickCandidates(found, { keep = 12, perHeight = 3 } = {}) {
  // A mix: up to half that work with the breakers you have, the rest better versions that need more.
  if (found.some(f => f.when === 'later') && found.some(f => f.when === 'now')) {
    const half = Math.ceil(keep / 2);
    const now = pickCandidates(found.filter(f => f.when === 'now').map(f => ({ ...f, when: 'now*' })), { keep: half, perHeight });
    const later = pickCandidates(found.filter(f => f.when === 'later').map(f => ({ ...f, when: 'later*' })), { keep: keep - now.length, perHeight });
    return [...now, ...later].map(f => ({ ...f, when: f.when.slice(0, -1), frames: f.frames.map(v => ({ ...v, when: f.when.slice(0, -1) })) }));
  }
  // Among builds that need more, fewer extra breakers first.
  found = [...found].sort((a, b) => b.picked - a.picked || (a.when === 'later*' ? a.uses - b.uses : 0) || b.gained - a.gained || b.room - a.room);
  const perH = new Map(), chosen = [], seen = new Map();
  for (const f of found) {
    const key = [f.body.height, f.body.wingspan, f.type].join();
    const twin = seen.get(key);
    if (twin) { twin.variants.push(f); continue; }
    if (chosen.length >= keep || (perH.get(f.body.height) ?? 0) >= perHeight) continue;
    perH.set(f.body.height, (perH.get(f.body.height) ?? 0) + 1);
    const c = { ...f, variants: [f] };
    chosen.push(c); seen.set(key, c);
  }
  return chosen.map(({ variants, ...c }) => ({ ...c, frames: framesOf(variants) }));
}

// Frames to build for a family: the lightest, middle and heaviest weights that reach as much of your targets as the
// best one, each as one position per meta group it's legal at (guard / wing / big: position changes what the meta
// wants, so a 6'9" 235 lb SF and PF are different builds). Positions in the same group share the result.
export function framesOf(variants) {
  const top = Math.max(...variants.map(v => v.picked));
  const pool = [...new Map(variants.filter(v => v.picked === top).map(v => [v.body.weight, v])).values()]
    .sort((a, b) => a.body.weight - b.body.weight);
  const mid = pool[Math.floor((pool.length - 1) / 2)];
  const out = [];
  for (const v of [...new Set([pool[0], mid, pool.at(-1)])]) {
    const legal = positionsFor(v.body), byGroup = new Map();
    for (const p of legal) if (!byGroup.has(metaGroup(p))) byGroup.set(metaGroup(p), p);
    for (const [group, position] of byGroup) out.push({ ...v, body: { ...v.body, position },
      alsoPositions: legal.filter(p => p !== position && metaGroup(p) === group) });
  }
  return out;
}

// Your targets come first: a build that hits all of them beats one that doesn't. Between two that miss, each point
// short costs SHORT_COST meta (so 2 points of Driving Dunk don't outweigh 20 meta); between two that hit, meta decides.
export const SHORT_COST = 3;
export const shortOf = r => Object.entries(r.hunt?.goal ?? {}).reduce((s, [i, g]) => s + Math.max(0, g - r.final[i]), 0);
export const reachedOf = r => Object.entries(r.hunt?.goal ?? {}).reduce((s, [i, g]) => s + Math.min(r.final[i], g), 0);
export const targetsFirst = (a, b) => (shortOf(a) === 0 ? 0 : 1) - (shortOf(b) === 0 ? 0 : 1);
export const huntScore = r => (r.meta ?? 0) - SHORT_COST * shortOf(r);
export const bestFrame = built => built.filter(r => r && !r.error)
  .sort((a, b) => targetsFirst(a, b) || huntScore(b) - huntScore(a))[0] ?? null;

// Full build for one screened candidate: the optimizer with the archetype forced and the picks as minimums.
export function huntBuild(candidate, opts) {
  const minimums = attributes.map((_, i) => Math.max(opts.minimums?.[i] ?? 25, candidate.targets[i]));
  // What you have now goes first; whatever else the plan needs is "later" (the build shows what works today).
  // "now" builds spend exactly the breakers you have; "later" ones just what their plan needs past that.
  const have = opts.breakers?.general ?? 0;
  const future = candidate.when === 'later' ? Math.max(0, (candidate.uses ?? have) - have) : 0;
  const breakers = { ...opts.breakers, general: have, future };
  const r = optimizeBody(candidate.body, { ...opts, breakers, minimums, forceType: candidate.type, presetBreakers: candidate.preset, seeds: 0 });
  if (r.error) return r;
  return { ...r, alsoPositions: candidate.alsoPositions ?? [], hunt: { type: candidate.type, picked: candidate.picked, when: candidate.when ?? 'now', goal: candidate.goal ?? {} },
    meta: metaScore(r.final, candidate.body.height, candidate.body.position, opts.mode, nearOf(r)) };
}

export const previewBody = (position, height) => defaultBody(position, height);
