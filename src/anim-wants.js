// Animations you want (jumpers, dribble styles, layup packages… from HQ's glossary) as Lab requirements, and saved
// profiles of them (e.g. one for bigs, one for guards) with optional hard attribute minimums.
import { animationTabs, sizeFamily } from './unlocks.js';
import { attributes } from './engine.js';

export const animKey = (tab, group, name) => `${tab}/${group}/${name}`;
// Every animation with a rating requirement, flat: { key, name, tab, group, sizes, or, reqs: [[attribute index, min]] }.
export const allAnimations = animationTabs.flatMap(t => t.groups.flatMap(g => g.anims.filter(a => a.reqs.length)
  .map(a => ({ key: animKey(t.name, g.name, a.name), name: a.name, tab: t.name, group: g.name, sizes: a.sizes, or: a.or, reqs: a.reqs,
    prized: a.prized, season: a.season }))));
const byKey = new Map(allAnimations.map(a => [a.key, a]));
// Wanted entries are glossary keys, or custom jumpers: { key: 'custom/…', name, group: 'Custom jumper', reqs, or: true, sizes: 'A' }.
export const findAnimation = key => typeof key === 'object' && key ? key : byKey.get(key);
export const wantKey = w => typeof w === 'object' && w ? w.key : w;
// A custom jump shot (base + upper releases + blend): its requirement is what the game shows you, entered by hand, since
// nobody has published how releases and blend set it. Three point or mid-range, like every jumper.
export const customJumper = ({ base, r1, r2, blend, req }) => {
  const parts = [base, r1 && r2 ? `${r1}/${r2}${blend != null ? ` ${blend}/${100 - blend}` : ''}` : r1].filter(Boolean);
  return { key: `custom/${parts.join('|')}/${req}`, name: parts.join(' · ') || 'Custom jumper', tab: 'Custom', group: 'Custom jumper', sizes: 'A', or: true,
    reqs: [[attributes.findIndex(a => a.name === 'mid_range'), req], [attributes.findIndex(a => a.name === 'three_point'), req]], custom: { base, r1, r2, blend, req } };
};

const fitsFamily = (sizes, family) => sizes === 'A' || sizes.includes(family);
export const SIZE_LABEL = { S: 'smalls', W: 'swings', B: 'bigs' };
export const sizesText = sizes => sizes === 'A' ? 'all sizes' : [...sizes].map(c => SIZE_LABEL[c]).filter(Boolean).join(' & ');
// Heights (inches) an animation is available at: smalls 5'9"–6'4", swings 6'5"–6'9", bigs 6'10"–7'4".
const RANGES = { S: [69, 76], W: [77, 81], B: [82, 88] };
export const heightsFor = sizes => sizes === 'A' ? [69, 88] : [Math.min(...[...sizes].map(c => RANGES[c][0])), Math.max(...[...sizes].map(c => RANGES[c][1]))];

// Search by player/animation name, group ("jump shot", "layup") or tab; words can match any of them.
export function searchAnimations(query, { family = null, limit = 40, tab = '', group = '' } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length && !tab && !group) return [];
  const hits = [];
  for (const a of allAnimations) {
    if (family && !fitsFamily(a.sizes, family)) continue;
    if ((tab && a.tab !== tab) || (group && a.group !== group)) continue;
    const hay = `${a.name} ${a.group} ${a.tab}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    hits.push({ a, score: !words.length ? 0 : a.name.toLowerCase().startsWith(words[0]) ? 0 : a.group.toLowerCase().includes(words[0]) ? 1 : 2 });
    if (hits.length > 2000) break;
  }
  return hits.sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name)).slice(0, limit).map(x => x.a);
}

// "Either of" requirements: keep the branch you already need (or the cheapest), threes over mid-range on a tie.
const PREFER = ['three_point', 'ball_handle', 'speed_with_ball', 'driving_dunk', 'driving_layup', 'mid_range'];
const prefer = i => { const k = PREFER.indexOf(attributes[i].name); return k < 0 ? 99 : k; };
// The rating minimums (attribute name → minimum) that unlock every wanted animation.
export function wantMinimums(wants, minimums = {}) {
  const out = {};
  const have = i => Math.max(out[attributes[i].name] ?? 0, minimums[attributes[i].name] ?? 0);
  for (const w of wants ?? []) {
    const a = findAnimation(w) ?? (typeof w === 'object' ? w : null);
    if (!a) continue;
    const reqs = a.or ? [[...a.reqs].sort((x, y) => (have(y[0]) >= y[1]) - (have(x[0]) >= x[1]) || x[1] - y[1] || prefer(x[0]) - prefer(y[0]))[0]] : a.reqs;
    for (const [i, min] of reqs) out[attributes[i].name] = Math.max(out[attributes[i].name] ?? 0, min);
  }
  return out;
}
// Wanted animations that aren't available anywhere in a height range.
export const outOfRange = (wants, heights) => (wants ?? []).map(findAnimation).filter(a => a && (() => {
  const [lo, hi] = heightsFor(a.sizes); return hi < heights[0] || lo > heights[1];
})());
export const availableAt = (a, height) => fitsFamily(a.sizes, sizeFamily(height));

// ---------------------------------------------------------------- profiles
const PROFILES_KEY = 'court-builder.anim-profiles.v1';
export const readProfiles = () => { try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) ?? []; } catch { return []; } };
export const writeProfiles = list => { try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch { /* storage full */ } };

// Types (HQ tabs) and their groups, for filters.
export const animationTypes = [...new Set(allAnimations.map(a => a.tab))];
export const groupsOf = tab => [...new Set(allAnimations.filter(a => !tab || a.tab === tab).map(a => a.group))];
