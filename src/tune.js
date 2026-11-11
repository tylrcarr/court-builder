// Local build tuning: unlock a badge tier by trading Overall budget away from other attributes, and a
// badge maximizer built on top of it. Pure functions over (base ratings, body, Cap Breaker counts).
import { assess, attributes, badgeTier, capsFor, ladder, lowerLinkedRatings, resolveLinks, tiers } from './engine.js';
import { fill } from './solver.js';
import { BASE_CEILING, badgeValue, deadWeight, feelFor, nextBreakpoint, specMinimums } from './breakpoints.js';
import { derive, nearBadges } from './derive.js';

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

// Lower every non-feel attribute to its live breakpoint (keeping every valued badge tier, the Cap Breakers
// already placed and the specialization), then put the freed budget into feel attributes.
export function trimDeadWeight(build, userPrefs, locks = attributes.map(() => false)) {
  const { body } = build;
  const h = body.height;
  const d = derive(build);
  const prefs = { ...userPrefs, continuous: feelFor(userPrefs, body.position, d.final) };
  const { floors: badgeFloors } = deadWeight(d.final, h, prefs, build.category, d.ratings);
  // Attributes carrying Cap Breakers are deliberate: keep them where they are.
  const floors = badgeFloors.map((f, i) => d.applied[i] > 0 ? d.final[i] : f);
  const spec = build.category && d.specOk ? specMinimums(build.category) : null;
  const ok = dd => dd.final.every((v, j) => v >= floors[j]) && (!spec || dd.ratings.every((v, j) => v >= spec[j]));
  let base = [...build.base];
  const before = d.state.score;
  for (let i = 0; i < base.length; i++) {
    if (locks[i] || d.final[i] <= floors[i]) continue;
    for (let v = derive({ ...build, base }).ratings[i] - 1; v >= 25; v--) {
      const cand = lowerLinkedRatings(base, h, i, v);
      if (!ok(derive({ ...build, base: cand }))) break;
      base = cand;
    }
  }
  const trimmed = derive({ ...build, base });
  const freed = before - trimmed.state.score;
  const ctx = { body, h, caps: trimmed.caps };
  const cw = prefs.continuousWeights ?? {};
  const weights = attributes.map((a, i) => prefs.continuous.includes(a.name) && !locks[i] ? cw[a.name] ?? 1 : 0);
  let plan = fill({ manual: base, breakers: trimmed.applied }, weights, ctx, locks, floors);
  // Feel attributes capped: climb to the next valued breakpoints, best badge value per Overall point first.
  let next = chaseBreakpoints({ ...build, base: plan.manual }, prefs, locks, floors);
  if (derive({ ...build, base: next }).state.score < 99 - 0.05) {
    const loose = fill({ manual: next, breakers: trimmed.applied }, attributes.map((_, i) => locks[i] ? 0 : 1), ctx, locks, floors, BASE_CEILING);
    const value = b => badgeValue(derive({ ...build, base: b }).final, h, prefs);
    if (value(loose.manual) >= value(next)) next = loose.manual;
  }
  plan = { manual: next };
  const after = derive({ ...build, base: plan.manual });
  const changes = attributes.map((a, i) => [a.name, after.final[i] - d.final[i]]).filter(([, x]) => x);
  return { base: plan.manual, freed, changes };
}

// Raise single attributes exactly to their next valued breakpoint while it fits, best value per OVR first.
export function chaseBreakpoints(build, prefs, locks = attributes.map(() => false), floors = null) {
  const h = build.body.height;
  let base = [...build.base];
  for (let round = 0; round < 60; round++) {
    const d = derive({ ...build, base });
    const value = badgeValue(d.final, h, prefs);
    let best = null;
    for (let i = 0; i < base.length; i++) {
      if (locks[i]) continue;
      const target = nextBreakpoint(i, d.final, h, prefs, build.category, d.caps);
      if (!target || target.rating > d.caps[i]) continue;
      let cand = base, dd = d;
      for (let guard = 0; guard < 30 && dd.final[i] < target.rating; guard++) {
        cand = choose(cand, i, dd.ratings[i] + 1);
        dd = derive({ ...build, base: cand });
        if (!dd.state.withinCaps || dd.state.score > 99 + 1e-8) break;
      }
      if (dd.final[i] < target.rating || !dd.state.fits) continue;
      if (floors && dd.final.some((v, j) => v < floors[j])) continue;
      const gain = badgeValue(dd.final, h, prefs) - value;
      if (gain <= 0) continue;
      const ratio = gain / Math.max(0.02, dd.state.score - d.state.score);
      if (!best || ratio > best.ratio) best = { cand, ratio };
    }
    if (!best) break;
    base = best.cand;
  }
  return base;
}
