// Local build tuning: unlock a badge tier by trading Overall budget away from other attributes, and a
// badge maximizer built on top of it. Pure functions over (base ratings, body, Cap Breaker counts).
import { assess, attributes, badgeTier, capsFor, ladder, lowerLinkedRatings, resolveLinks, tiers } from './engine.js';
import { fill } from './solver.js';
import { derive, nearBadges } from './ui/derive.js';

const choose = (values, i, v) => values.map((old, j) => j === i ? v : old);

// Returns { base, trimmed } with the tier unlocked and the build refilled to 99, or { error }.
export function unlockTier(build, near, locks = attributes.map(() => false)) {
  const { body, base } = build;
  const d = derive(build);
  let next = base;
  for (const g of near.gaps) next = choose(next, g.attribute, Math.max(next[g.attribute], g.need));
  let trial = assess(resolveLinks(next, body.height), body.height, d.caps);
  if (!trial.withinCaps) return { error: "That tier is above this body's caps." };
  const protect = new Set(near.gaps.map(g => g.attribute));
  const keep = d.unlocked.map(u => [u.badge, tiers.indexOf(u.tier)]);
  const trimmed = {};
  const finalOf = resolved => {
    const pt = assess(resolved, body.height, d.caps).playerType;
    return resolved.map((r, j) => r + ladder(j, r, d.caps[j], body.height, pt).slice(0, d.applied[j]).reduce((s, g) => s + g, 0));
  };
  for (let guard = 0; !trial.fits && guard < 300; guard++) {
    let best = null;
    for (let i = 0; i < next.length; i++) {
      if (protect.has(i) || locks[i] || next[i] <= 25) continue;
      const cand = lowerLinkedRatings(next, body.height, i, next[i] - 1);
      const resolved = resolveLinks(cand, body.height);
      if (near.gaps.some(g => resolved[g.attribute] < g.need)) continue;
      const fin = finalOf(resolved);
      if (keep.some(([badge, t]) => tiers.indexOf(badgeTier(badge, fin, body.height)) < t)) continue;
      const sc = assess(resolved, body.height, d.caps);
      const saving = trial.score - sc.score;
      if (saving > 0 && (!best || saving > best.saving)) best = { cand, sc, saving, i };
    }
    if (!best) break;
    next = best.cand; trial = best.sc; trimmed[best.i] = (trimmed[best.i] ?? 0) + 1;
  }
  if (!trial.fits) return { error: 'It would cost a badge you already have.' };
  const weights = attributes.map((_, i) => locks[i] ? 0 : Math.max(0.05, (d.ratings[i] - 25) / 74) ** 2);
  next = fill({ manual: next, breakers: d.applied }, weights, { body, h: body.height, caps: capsFor(body) }, locks).manual;
  return { base: next, trimmed };
}

// Greedily unlocks nearby tiers while the total badge tier points rise.
export function maximizeBadges(build, locks, { rounds = 40, within = 10 } = {}) {
  let current = build, points = derive(build).badgePoints;
  const gained = [];
  for (let round = 0; round < rounds; round++) {
    const d = derive(current);
    let improved = false;
    for (const n of nearBadges(d.final, current.body.height, within)) {
      const result = unlockTier(current, n, locks);
      if (result.error) continue;
      const candidate = { ...current, base: result.base };
      const p = derive(candidate).badgePoints;
      if (p > points) { current = candidate; points = p; gained.push(`${n.badge.name} ${n.tier}`); improved = true; break; }
    }
    if (!improved) break;
  }
  return { build: current, points, gained };
}
