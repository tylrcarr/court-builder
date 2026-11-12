// Breaker Hunt: pick the attributes you want Cap Breakers to carry, find the archetype (player type) that lets them
// carry the most, and builds that really are that archetype. Each breaker step is bigger when the active archetype
// weighs that attribute lightly (see engine.ladder), so the same 5 breakers can add +5 under one archetype and +18
// under another. Lightly weighted also means the base rating is cheap in Overall.
import { attributes, capsFor, defaultBody, ladder, playerTypeCount, typeWeights } from './engine.js';
import { MAX_SPECIALIZED, bodiesFor, metaScore, optimizeBody, specMinimums } from './breakpoints.js';
import { satisfyAs } from './solver.js';

export const STEPS = 5; // breakers per attribute (the game's limit)

// Lowest base from which `n` breakers reach `target` under `type`, and what they add from there. Steps shrink as the
// rating climbs, so reaching 90 can take +13 where reaching the cap (98) only gets +7.
export function reach(i, target, cap, height, type, n = STEPS) {
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

// For each attribute not picked yet: the best total the picks would get with it added (under the best archetype).
export function nextPickHints(picks, body, targets = {}) {
  return attributes.map((_, i) => picks.includes(i) ? null : archetypeTable([...picks, i], body, targets)[0].total);
}

const poolFor = breakers => {
  const category = breakers?.special?.category ?? '';
  return { general: breakers?.general ?? 0, special: { category, count: category ? MAX_SPECIALIZED : 0 } };
};

// Can this body be `type` with the picks at their targets (finals)? If not, gives up 3 points on one pick at a time
// (whichever keeps the most), so one hard target doesn't drag the others down; all three only if no single one works.
function lockIn(body, picks, want, type, pool) {
  const caps = capsFor(body), ctx = { body, h: body.height, caps };
  const floor = specMinimums(pool.special.category);
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

// Screen bodies × their best-fitting archetypes for ones that can actually be locked in under 99 Overall.
export function huntScreen(positionList, heights, picks, want, breakers, { perBody = 4, onProgress } = {}) {
  const pool = poolFor(breakers);
  const bodies = bodiesFor(positionList, heights, { frames: 3 });
  const found = [];
  bodies.forEach((body, n) => {
    for (const row of archetypeTable(picks, body, want).slice(0, perBody)) {
      const hit = lockIn(body, picks, want, row.type, pool);
      if (!hit) continue;
      // How close the picks get to what you asked for (overshoot doesn't count; a frame with a lower cap does).
      const picked = picks.reduce((s, i) => s + Math.min(hit.plan.final[i], want?.[i] || 99), 0);
      const gained = picks.reduce((s, i) => s + hit.plan.final[i] - hit.plan.base[i], 0);
      found.push({ body, type: row.type, targets: hit.targets, under: hit.under,
        preset: Object.fromEntries(picks.map(i => [i, hit.plan.breakers[i]]).filter(([, n]) => n > 0)), picked, gained, room: 99 - hit.plan.ovr });
    }
    onProgress?.({ done: n + 1, total: bodies.length });
  });
  return { found, screened: bodies.length };
}

// Best screened candidates: closest to your targets first, then most breaker points on the picks, then Overall room left for the
// rest of the build. Spread across heights: at most `perHeight` per position/height.
export function pickCandidates(found, { keep = 12, perHeight = 2 } = {}) {
  found = [...found].sort((a, b) => b.picked - a.picked || b.gained - a.gained || b.room - a.room);
  // Spread across heights: at most `perHeight` per position/height.
  const seen = new Map(), chosen = [];
  for (const f of found) {
    const k = f.body.position + f.body.height;
    if ((seen.get(k) ?? 0) >= perHeight) continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    chosen.push(f);
    if (chosen.length >= keep) break;
  }
  return chosen;
}

// Full build for one screened candidate: the optimizer with the archetype forced and the picks as minimums.
export function huntBuild(candidate, opts) {
  const minimums = attributes.map((_, i) => Math.max(opts.minimums?.[i] ?? 25, candidate.targets[i]));
  const r = optimizeBody(candidate.body, { ...opts, minimums, forceType: candidate.type, presetBreakers: candidate.preset, seeds: 0 });
  if (r.error) return r;
  return { ...r, hunt: { type: candidate.type, picked: candidate.picked },
    meta: metaScore(r.final, candidate.body.height, candidate.body.position, opts.mode) };
}

export const previewBody = (position, height) => defaultBody(position, height);
