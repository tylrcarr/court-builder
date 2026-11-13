// Plain names for the game's archetypes (player types). Every height has 15; the game picks yours from your base
// ratings, and it sets how much each attribute counts toward Overall and how far each Cap Breaker goes. The names
// come from what each archetype weighs most compared with the other archetypes at the same height: the playstyle
// it's built around, before any Cap Breakers.
import { attributes, playerTypeCount, typeWeights } from './engine.js';

const STYLES = [
  // [id, attributes, adjective, noun]
  ['shoot', ['three_point', 'mid_range'], 'Sharpshooting', 'Shooter'],
  ['handle', ['ball_handle', 'speed_with_ball'], 'Shifty', 'Ball Handler'],
  ['pass', ['pass_accuracy'], 'Playmaking', 'Playmaker'],
  ['perimeter', ['perimeter_defense', 'steal'], 'Lockdown', 'Perimeter Defender'],
  ['rim', ['interior_defense', 'block'], 'Rim-Protecting', 'Rim Protector'],
  ['boards', ['offensive_rebound', 'defensive_rebound'], 'Glass-Cleaning', 'Rebounder'],
  ['slash', ['driving_dunk', 'vertical'], 'Slashing', 'Slasher'],
  ['finish', ['driving_layup', 'close_shot'], 'Finishing', 'Finisher'],
  ['post', ['post_control'], 'Post', 'Post Scorer'],
  ['power', ['standing_dunk', 'strength'], 'Bruising', 'Power Big'],
  ['quick', ['speed', 'agility'], 'Quick', 'Athlete'],
];
const ix = Object.fromEntries(attributes.map(a => [a.name, a.index]));
const cache = new Map();

// For one height: every archetype's name, its leading styles and its most / least weighted attributes.
export function archetypesAt(height) {
  if (cache.has(height)) return cache.get(height);
  const n = playerTypeCount(height);
  const all = Array.from({ length: n }, (_, t) => typeWeights(height, t));
  const mean = attributes.map((_, i) => all.reduce((s, w) => s + w[i], 0) / n);
  const list = all.map((w, t) => {
    const ws = w.filter((_, i) => i !== ix.free_throw), top = Math.max(...ws);
    const spread = top - Math.min(...ws);
    // What it weighs most (absolute), nudged by how much more than the average archetype at this height it does.
    const styles = STYLES.map(([id, attrs, adj, noun]) => ({ id, adj, noun,
      score: attrs.reduce((s, a) => s + (w[ix[a]] + 0.75 * (w[ix[a]] - mean[ix[a]])) / top, 0) / attrs.length }))
      .sort((a, b) => b.score - a.score);
    const order = attributes.map((a, i) => ({ name: a.name, w: w[i] })).filter(x => x.name !== 'free_throw').sort((a, b) => b.w - a.w);
    return { type: t, styles, flat: spread < 0.5, heavy: order.slice(0, 4).map(x => x.name), light: order.slice(-4).reverse().map(x => x.name) };
  });
  const names = list.map(x => x.flat ? 'Balanced' : `${x.styles[1].adj} ${x.styles[0].noun}`);
  // Two archetypes with the same top styles: tell them apart by the third.
  names.forEach((nm, t) => {
    const twins = names.map((m, k) => m === nm ? k : -1).filter(k => k >= 0);
    if (twins.length > 1 && !list[t].flat) names[t] = `${nm} (${list[t].styles[2].adj.replace(/-.*/, '').toLowerCase()})`;
  });
  // Still the same (or the flat "Balanced" ones): number them.
  const seen = {};
  const total = names.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
  const out = list.map((x, t) => {
    const nm = names[t], k = seen[nm] = (seen[nm] ?? 0) + 1;
    return { ...x, name: total[nm] > 1 ? `${nm} ${['I', 'II', 'III', 'IV', 'V'][k - 1] ?? k}` : nm };
  });
  cache.set(height, out);
  return out;
}

export const archetypeName = (height, type) => archetypesAt(height)[type]?.name ?? `Archetype ${type + 1}`;
export const archetypeInfo = (height, type) => archetypesAt(height)[type];
