import { assess, attributes, badges, badgeTier, capsFor, inHeight, ladder, resolveLinks, tiers } from './engine.js';
import { buildName } from './build-name.js';
import tokenTable from './badge-tokens.json' with { type: 'json' };
import { MAX_SPECIALIZED, specUnlocked } from './breakpoints.js';

export const zeros = () => attributes.map(() => 0);
export const groups = [...new Set(attributes.map(a => a.discipline))];
export const tierLabel = t => t === 'hall_of_fame' ? 'Hall of Fame' : t ? t[0].toUpperCase() + t.slice(1) : 'Locked';
export const tierShort = t => ({ bronze: 'B', silver: 'S', gold: 'G', hall_of_fame: 'HoF', legend: 'Leg' })[t] ?? '–';

// Everything the UI needs about a build, computed in one place.
// Specialization always grants MAX_SPECIALIZED (2) breakers once unlocked, so builds carry no specialized count.
export function derive({ body, base, breakers = zeros(), budget = 0, category = '' }) {
  const caps = capsFor(body);
  const ratings = resolveLinks(base, body.height).map((v, i) => Math.min(v, caps[i]));
  const state = assess(ratings, body.height, caps);
  const ladders = ratings.map((r, i) => ladder(i, r, caps[i], body.height, state.playerType));
  const applied = breakers.map((n, i) => Math.min(n, ladders[i].filter(Boolean).length));
  const final = ratings.map((r, i) => r + ladders[i].slice(0, applied[i]).reduce((s, g) => s + g, 0));
  const breakerCount = applied.reduce((s, n) => s + n, 0);
  const specOk = specUnlocked(category, ratings);
  const specialUsed = category && specOk ? Math.min(MAX_SPECIALIZED, applied.reduce((s, n, i) =>
    s + (attributes[i].discipline === category || attributes[i].name === 'free_throw' ? n : 0), 0)) : 0;
  const generalUsed = breakerCount - specialUsed;
  const linkedFloors = ratings.map((_, i) => resolveLinks(base.map((v, j) => j === i ? 25 : v), body.height)[i]);
  const unlocked = badges.filter(b => inHeight(b, body.height))
    .map(b => ({ badge: b, tier: badgeTier(b, final, body.height) })).filter(x => x.tier);
  const name = buildName(body.position, ratings);
  const finalName = breakerCount ? buildName(body.position, final) : name;
  return { height: body.height, position: body.position, category, caps, ratings, state, ladders, applied, final, breakerCount, specialUsed, generalUsed,
    overBudget: generalUsed > budget, specOk, linkedFloors, unlocked, name, finalName,
    badgePoints: unlocked.reduce((s, x) => s + tiers.indexOf(x.tier) + 1, 0) };
}

// Next badge tiers reachable soon: the cheapest single-attribute gaps for the following tier.
// caps (optional): skip requirement branches the body can never reach.
export function nearBadges(final, height, within = 6, caps = null) {
  const out = [];
  for (const badge of badges) {
    if (!inHeight(badge, height)) continue;
    const current = badgeTier(badge, final, height);
    const nextIndex = current ? tiers.indexOf(current) + 1 : 0;
    const next = badge.tiers[nextIndex];
    if (!next) continue;
    // Gap = points needed on the cheapest alternative branch.
    let best = null;
    let branch = [], branches = [];
    next.requirements.forEach((req, i) => {
      branch.push(req);
      if (req.operator_to_next !== 'AND' || i === next.requirements.length - 1) { branches.push(branch); branch = []; }
    });
    for (const reqs of branches) {
      if (caps && reqs.some(r => r.minimum > caps[r.attribute])) continue;
      const gaps = reqs.map(r => ({ name: r.name, attribute: r.attribute, need: r.minimum, gap: Math.max(0, r.minimum - final[r.attribute]) }));
      const total = gaps.reduce((s, g) => s + g.gap, 0);
      if (!best || total < best.total) best = { total, gaps: gaps.filter(g => g.gap > 0) };
    }
    if (best && best.total > 0 && best.total <= within) out.push({ badge, tier: next.tier, ...best });
  }
  return out.sort((a, b) => a.total - b.total);
}

// 2K27 Synergy (official MyPLAYER builder page): 16 slots, 12 give +1 tier and 4 give +2, up to Legend. A Fuse badge
// is boosted all game and costs no tokens; a Reaction badge gets the same boost once its Fuse has triggered enough
// times in a game. synergy = { [badge name]: { boost: 1 | 2, reaction?: true } }. Boosts apply to unlocked badges only
// (2K hasn't said whether a badge you don't qualify for can be fused).
export const SYNERGY_SLOTS = { 1: 12, 2: 4 };
export const LEGEND = 'legend';
export const shownTiers = [...tiers, LEGEND];
export function applySynergy(unlocked, synergy = {}) {
  const rows = unlocked.map(u => {
    const s = synergy[u.badge.name];
    const boost = s?.boost ?? 0;
    return { ...u, boost, reaction: !!s?.reaction, shown: shownTiers[Math.min(shownTiers.length - 1, tiers.indexOf(u.tier) + boost)] };
  });
  const used = { 1: 0, 2: 0 };
  for (const r of rows) if (r.boost) used[r.boost]++;
  const fuses = rows.filter(r => r.boost && !r.reaction).length, reactions = rows.filter(r => r.boost && r.reaction).length;
  return { rows, used, fuses, reactions, legends: rows.filter(r => r.shown === LEGEND).length };
}

// Badge tokens each discipline gets: every attribute adds tokens to its own discipline by rating. Tokens are spent per
// discipline, not from one pool. HQ's table covers 5'9"–6'9"; other heights use the nearest one (tokensEstimated).
export function disciplineTokens(ratings, height) {
  const hs = Object.keys(tokenTable.tokens).map(Number);
  const h = Math.max(Math.min(...hs), Math.min(Math.max(...hs), height));
  const rows = tokenTable.tokens[h];
  const out = Object.fromEntries(groups.map(g => [g, 0]));
  attributes.forEach((a, i) => { out[a.discipline] += parseInt(rows[i][Math.max(0, Math.min(74, ratings[i] - 25))], 36); });
  return out;
}
const tokenHeights = Object.keys(tokenTable.tokens).map(Number);
export const tokensEstimated = height => !tokenHeights.includes(height);
