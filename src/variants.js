// Variations: the same search with one direction pushed, so the results aren't all the same build. Each takes the
// optimizer options and returns adjusted ones. Your explicit "Don't care" (value 0) is always respected; musts and
// minimums stay as they are.
import { goals } from './breakpoints.js';
import { animations } from './animations.js';
import { attributes } from './engine.js';

const byDiscipline = d => goals.filter(g => g.discipline === d).map(g => g.name);
const bump = (o, names, v) => {
  const values = { ...o.values };
  for (const n of names) if (values[n] !== 0) values[n] = Math.max(values[n] ?? 0, v);
  return { ...o, values };
};
const feel = (o, map) => {
  const continuous = [...new Set([...(o.continuous ?? []), ...Object.keys(map)])];
  const continuousWeights = { ...o.continuousWeights };
  for (const [k, w] of Object.entries(map)) continuousWeights[k] = Math.max(continuousWeights[k] ?? 0, w);
  return { ...o, continuous, continuousWeights };
};
const cap = (o, map) => ({ ...o, maximums: o.maximums.map((m, i) => Math.min(m, map[attributes[i].name] ?? 99)) });

export const VARIANTS = [
  { id: 'faster', aspects: ['Faster'], label: 'Faster', blurb: 'Speed and agility first.', apply: o => feel(o, { speed: 3, agility: 3 }) },
  { id: 'physicals', aspects: ['More athletic', 'Faster'], label: 'Better physicals', blurb: 'Speed, agility, vertical and strength.',
    apply: o => feel(o, { speed: 2, agility: 2, vertical: 2, strength: 1.5 }) },
  { id: 'playmaking', aspects: ['Better handle', 'Better passing'], label: 'More playmaking', blurb: 'Playmaking badges and handle.',
    apply: o => feel(bump(o, byDiscipline('playmaking'), 2), { ball_handle: 2, speed_with_ball: 1.5 }) },
  { id: 'shooting', aspects: ['Better shooting'], label: 'Better shooting', blurb: 'Shooting badges and three point.',
    apply: o => feel(bump(o, byDiscipline('shooting'), 2), { three_point: 1, mid_range: 0.5 }) },
  { id: 'defense', aspects: ['Better perimeter D', 'Better rim protection'], label: 'Better defense', blurb: 'Defensive badges and perimeter defense.',
    apply: o => feel(bump(o, byDiscipline('defense'), 2), { perimeter_defense: 1 }) },
  { id: 'steals', aspects: ['Better perimeter D'], label: 'More steals', blurb: 'Steal, Interceptor and Glove.',
    apply: o => feel(bump(o, ['interceptor', 'glove'], 2.5), { steal: 3 }) },
  { id: 'rebounding', aspects: ['Better rebounding'], label: 'Better rebounding', blurb: 'Rebounding badges and boards.',
    apply: o => feel(bump(o, byDiscipline('rebounding'), 2), { defensive_rebound: 1 }) },
  { id: 'dunking', aspects: ['Better dunking'], label: 'More dunking', blurb: 'Posterizer, contact dunks and driving dunk.',
    apply: o => feel(bump(bump(o, ['posterizer'], 3), ['pro_contact_off_two', 'pro_contact_off_one', 'elite_contact_off_two'], 2),
      { driving_dunk: 1.5 }) },
  { id: 'finishing', aspects: ['Better layups'], label: 'Better layups', blurb: 'Layup Mixmaster, Float Game and layups.',
    apply: o => feel(bump(o, ['layup_mixmaster', 'float_game', 'physical_finisher'], 2), { driving_layup: 1 }) },
  { id: 'no-dunk', label: 'No dunking', blurb: 'Driving dunk capped at 69: the points go elsewhere.',
    apply: o => cap({ ...o, values: { ...o.values, posterizer: 0, ...Object.fromEntries(animations.map(g => [g.name, 0])) } }, { driving_dunk: 69 }) },
];
