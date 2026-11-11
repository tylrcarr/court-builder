// Playstyle "vibes": plain-language goals mapped onto attribute weights and soft minimums.
import { attributes } from './engine.js';

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));

export const VIBES = [
  { id: 'sniper', label: 'Knock down threes', group: 'Shooting', attrs: { three_point: 3, free_throw: 1 }, floor: { three_point: 80 },
    words: ['three', '3pt', '3 point', 'three point', 'sniper', 'shooter', 'shoot', 'spot up', 'catch and shoot', 'deep', 'range'] },
  { id: 'midrange', label: 'Mid-range game', group: 'Shooting', attrs: { mid_range: 3, free_throw: 0.5 }, floor: { mid_range: 78 },
    words: ['mid', 'midrange', 'mid-range', 'pull up', 'fadeaway', 'jumper'] },
  { id: 'freethrow', label: 'Free throws', group: 'Shooting', attrs: { free_throw: 2 }, words: ['free throw', 'ft'] },
  { id: 'closeshot', label: 'Close shots & touch', group: 'Inside scoring', attrs: { close_shot: 3 }, floor: { close_shot: 80 },
    words: ['close shot', 'touch', 'inside', 'score inside', 'paint', 'hook', 'putback'] },
  { id: 'layups', label: 'Layup finisher', group: 'Inside scoring', attrs: { driving_layup: 3, close_shot: 1 }, floor: { driving_layup: 80 },
    words: ['layup', 'finish', 'finisher', 'slash', 'slasher', 'drive', 'driving'] },
  { id: 'dunks', label: 'Rim-rocking dunks', group: 'Inside scoring', attrs: { driving_dunk: 3, vertical: 1 }, floor: { driving_dunk: 80 },
    words: ['dunk', 'poster', 'posterize', 'slam', 'lob', 'rim', 'athletic finisher'] },
  { id: 'standingdunk', label: 'Standing dunks', group: 'Inside scoring', attrs: { standing_dunk: 3, strength: 0.5 }, floor: { standing_dunk: 80 },
    words: ['standing dunk', 'lob threat', 'roll man', 'putback dunk'] },
  { id: 'post', label: 'Post scorer', group: 'Inside scoring', attrs: { post_control: 3, close_shot: 1, strength: 1 }, floor: { post_control: 78 },
    words: ['post', 'post up', 'back down', 'post scorer', 'post moves'] },
  { id: 'passing', label: 'Playmaking passer', group: 'Playmaking', attrs: { pass_accuracy: 3 }, floor: { pass_accuracy: 80 },
    words: ['pass', 'passer', 'passing', 'dime', 'dimer', 'playmaker', 'playmaking', 'assist', 'facilitator'] },
  { id: 'handles', label: 'Elite handles', group: 'Playmaking', attrs: { ball_handle: 3, speed_with_ball: 1.5 }, floor: { ball_handle: 80 },
    words: ['handle', 'handles', 'dribble', 'dribbler', 'iso', 'shifty', 'ankle', 'creator', 'shot creator'] },
  { id: 'speed', label: 'Speed', group: 'Athleticism', attrs: { speed: 3, speed_with_ball: 1 }, floor: { speed: 75 },
    words: ['speed', 'fast', 'quick', 'faster', 'transition', 'pace'] },
  { id: 'agility', label: 'Agility', group: 'Athleticism', attrs: { agility: 3 }, floor: { agility: 75 },
    words: ['agility', 'agile', 'lateral', 'quickness', 'shifty'] },
  { id: 'strength', label: 'Strength', group: 'Athleticism', attrs: { strength: 3 }, floor: { strength: 75 },
    words: ['strength', 'strong', 'physical', 'bully', 'tank'] },
  { id: 'vertical', label: 'Bounce', group: 'Athleticism', attrs: { vertical: 3 }, floor: { vertical: 75 },
    words: ['vertical', 'bounce', 'jump', 'hops', 'leaper', 'athletic'] },
  { id: 'perimeterd', label: 'Lockdown perimeter D', group: 'Defense', attrs: { perimeter_defense: 3, agility: 1 }, floor: { perimeter_defense: 80 },
    words: ['perimeter defense', 'perimeter d', 'lockdown', 'on ball', 'on-ball', 'guard defender', 'defend guards', 'perimeter defender'] },
  { id: 'steals', label: 'Pickpocket', group: 'Defense', attrs: { steal: 3 }, floor: { steal: 78 },
    words: ['steal', 'steals', 'pickpocket', 'passing lanes', 'interceptor'] },
  { id: 'interiord', label: 'Interior anchor', group: 'Defense', attrs: { interior_defense: 3, strength: 1 }, floor: { interior_defense: 80 },
    words: ['interior defense', 'interior d', 'anchor', 'paint defense', 'post defense'] },
  { id: 'blocks', label: 'Shot blocker', group: 'Defense', attrs: { block: 3, vertical: 1 }, floor: { block: 80 },
    words: ['block', 'blocks', 'rim protector', 'rim protection', 'swat'] },
  { id: 'rebounding', label: 'Glass cleaner', group: 'Rebounding', attrs: { defensive_rebound: 2.5, offensive_rebound: 2 }, floor: { defensive_rebound: 80 },
    words: ['rebound', 'rebounder', 'rebounding', 'boards', 'glass', 'board'] },
  { id: 'oreb', label: 'Offensive boards', group: 'Rebounding', attrs: { offensive_rebound: 3 }, floor: { offensive_rebound: 78 },
    words: ['offensive rebound', 'putback', 'crash'] },
];

export const VIBE_GROUPS = [...new Set(VIBES.map(v => v.group))];
export const LEVELS = [
  { id: 'nice', label: 'Nice to have', weight: 0.6, floorShift: -15 },
  { id: 'good', label: 'Good', weight: 1, floorShift: 0 },
  { id: 'elite', label: 'Elite', weight: 1.6, floorShift: 8 },
];

// Match free text to vibe ids. Longer phrases win; "good"/"elite" adjectives set the level.
export function parseVibes(text) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ')} `;
  const found = new Map();
  const phrases = VIBES.flatMap(v => v.words.map(w => ({ v, w }))).sort((a, b) => b.w.length - a.w.length);
  let rest = lower;
  for (const { v, w } of phrases) {
    const at = rest.indexOf(` ${w}`);
    if (at < 0) continue;
    const before = rest.slice(Math.max(0, at - 24), at);
    const level = /elite|great|best|insane|really good|very good|lockdown|knock/.test(before) ? 'elite'
      : /some|bit|ok|decent|little/.test(before) ? 'nice' : 'good';
    if (!found.has(v.id)) found.set(v.id, level);
    rest = rest.slice(0, at) + ' '.repeat(w.length + 1) + rest.slice(at + w.length + 1);
  }
  // Typo tolerance for single words ("gility" -> agility).
  const tokens = rest.split(/\s+/).filter(t => t.length >= 4);
  for (const v of VIBES) {
    if (found.has(v.id)) continue;
    if (v.words.some(w => !w.includes(' ') && w.length >= 5 && tokens.some(t => editDistance(t, w) <= 1))) found.set(v.id, 'good');
  }
  return Object.fromEntries(found);
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// selection: { vibeId: levelId } -> { weights[21], goals[21] }
export function vibesToSearch(selection, { useFloors = true } = {}) {
  const weights = attributes.map(() => 0.08);
  const goals = attributes.map(() => 25);
  for (const [id, levelId] of Object.entries(selection)) {
    const vibe = VIBES.find(v => v.id === id);
    const level = LEVELS.find(l => l.id === levelId) ?? LEVELS[1];
    if (!vibe) continue;
    for (const [name, w] of Object.entries(vibe.attrs)) weights[idx[name]] += w * level.weight;
    if (useFloors && vibe.floor && level.id !== 'nice')
      for (const [name, f] of Object.entries(vibe.floor)) goals[idx[name]] = Math.max(goals[idx[name]], Math.min(95, f + level.floorShift));
  }
  return { weights, goals };
}

// Strength profile of a build: which attributes stand out relative to the build itself.
export function strengthsOf(final, count = 7) {
  return attributes.map(a => ({ ...a, value: final[a.index] }))
    .sort((a, b) => b.value - a.value).slice(0, count);
}
