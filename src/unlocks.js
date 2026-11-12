// Animations and Takeovers a build unlocks.
import glossary from './anim-glossary.json' with { type: 'json' };
import { attributes } from './engine.js';

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));

// ---------------------------------------------------------------- animations
// Size families (HQ "Allowed Sizes"): smalls 5'9"–6'4", swings 6'5"–6'9", bigs 6'10"–7'4".
export const sizeFamily = height => height <= 76 ? 'S' : height <= 81 ? 'W' : 'B';
export const SIZE_NAMES = { S: 'Smalls', W: 'Swings', B: 'Bigs' };
const fits = (code, family) => code === 'A' || code.includes(family);

// Each animation: { name, sizes, or, reqs: [[attribute index, minimum]], prized, season }.
export const animationTabs = glossary.tabs.map(t => ({
  name: t.name,
  groups: t.groups.map(g => ({ name: g.name, anims: g.anims.map(([name, sizes, or, reqs, prized, season]) =>
    ({ name, sizes, or: !!or, reqs, prized: !!prized, season: season ?? 0 })) })),
}));
export const freeAnimationGroups = glossary.noRequirements;

// Points still needed: the cheapest branch for OR, every requirement for AND. Infinity if a needed rating is above
// the body's cap (for OR, only when every branch is).
export function animationGap(anim, final, caps) {
  if (!anim.reqs.length) return 0;
  const gaps = anim.reqs.map(([i, min]) => caps && min > caps[i] ? Infinity : Math.max(0, min - final[i]));
  return anim.or ? Math.min(...gaps) : gaps.reduce((s, g) => s + g, 0);
}
export const requirementLabel = (anim, nameOf) => anim.reqs.length
  ? anim.reqs.map(([i, min]) => `${nameOf(attributes[i].name)} ${min}`).join(anim.or ? ' or ' : ' and ') : 'No requirement';

// Every group for this body: which animations fit the size family, which are unlocked, and the closest locked ones.
export function animationStatus(final, height, caps) {
  const family = sizeFamily(height);
  return animationTabs.map(tab => ({
    name: tab.name,
    groups: tab.groups.map(g => {
      const list = g.anims.filter(a => fits(a.sizes, family)).map(a => ({ ...a, gap: animationGap(a, final, caps) }));
      return { name: g.name, total: list.length, unlocked: list.filter(a => a.gap === 0), locked: list.filter(a => a.gap > 0)
        .sort((a, b) => a.gap - b.gap || a.name.localeCompare(b.name)), otherSizes: g.anims.length - list.length };
    }),
  }));
}

// Lab minimums that unlock an animation or takeover: every requirement for AND, the cheapest reachable branch for OR.
export function minimumsFor(reqs, or, final, caps) {
  if (!or) return reqs.map(([i, min]) => [attributes[i].name, min]);
  const best = reqs.filter(([i, min]) => !caps || min <= caps[i]).sort((a, b) => (a[1] - final[a[0]]) - (b[1] - final[b[0]]))[0];
  return best ? [[attributes[best[0]].name, best[1]]] : [];
}

// ---------------------------------------------------------------- takeovers
// 2K27 Takeover abilities: one per discipline slot, fired when that discipline's meter maxes out. Requirements from
// the public tables (2KMyPLAYER, NBA2KLab, FilmRoomGG); HQ's native probe returns the same 18 gated abilities with the
// same thresholds (its attribute codes use an unresolved enum, but every threshold and AND/OR pattern matches).
const T = (name, slot, reqs, or, does) => ({ name, slot, reqs: reqs.map(([k, v]) => [idx[k], v]), or: !!or, does });
export const TAKEOVER_SLOTS = ['finishing', 'shooting', 'playmaking', 'defense', 'rebounding'];
export const takeovers = [
  T('Inside Touch', 'finishing', [['close_shot', 85]], 0, 'Wider timing window on standing layups.'),
  T('Navigator', 'finishing', [['driving_layup', 85]], 0, 'Wider timing window on driving and advanced layups.'),
  T('Airspace', 'finishing', [['driving_dunk', 87], ['vertical', 75]], 0, 'Forces contact dunks; easier alley-oops.'),
  T('Detonator', 'finishing', [['standing_dunk', 85]], 0, 'Wider timing window on standing dunks.'),
  T('Paint Surgeon', 'finishing', [['close_shot', 80], ['post_control', 75]], 0, 'Wins post matchups; better hooks, fades and post shots.'),
  T('Shot Artist', 'shooting', [['three_point', 89], ['mid_range', 89]], 1, 'Wider timing window on off-dribble jumpers.'),
  T('Calibrated', 'shooting', [['three_point', 85], ['mid_range', 85]], 1, 'Wider timing window on catch-and-shoot jumpers.'),
  T('Zip Code', 'shooting', [['three_point', 91]], 0, 'Deep shots play as if taken from closer.'),
  T('Blur', 'playmaking', [['ball_handle', 85], ['speed_with_ball', 80]], 0, 'Blow past defenders; easier drives.'),
  T('Cook', 'playmaking', [['ball_handle', 90]], 0, 'More ankle breakers.'),
  T('Dishmaster', 'playmaking', [['pass_accuracy', 80]], 0, 'Boosts the shooting and finishing of teammates you pass to.'),
  T('Glue', 'defense', [['perimeter_defense', 85]], 0, 'Forces pickups and fumbles; stays attached through screens.'),
  T('Hawk', 'defense', [['steal', 85]], 0, 'On-ball steals that force turnovers.'),
  T('Rim Guardian', 'defense', [['interior_defense', 80], ['block', 80]], 0, 'Wins post battles; elite rim protection.'),
  T('Demolition', 'rebounding', [['strength', 88]], 0, 'Heavier screens with forceful contact.'),
  T('Muscle', 'rebounding', [['offensive_rebound', 80], ['defensive_rebound', 80], ['strength', 80]], 0, 'Wins boxouts and rebounds.'),
  T('Second Chance', 'rebounding', [['offensive_rebound', 80]], 0, 'Shot feedback on every shot; better putbacks.'),
  T('See the Future', 'rebounding', [['offensive_rebound', 85], ['defensive_rebound', 85]], 0, 'Shows where a miss will come off.'),
];
export const takeoverGap = (t, final, caps) => animationGap(t, final, caps);
