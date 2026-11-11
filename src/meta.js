// "Meta" badge worth for NBA 2K27 (0 = not worth points … 3 = top of the meta), used to steer leftover Overall and
// Cap Breakers once your musts, minimums and picks are covered, and for the meta score on results.
// Sources (Nov 2026): Operation Sports "best badges in NBA 2K27, no matter your build" and MMOexp's 2K27 badge tier
// list, where they agree; plus calls made in this project (Set and Fire core, Quick Trigger minor, Off-Ball Pest
// worthless, Immovable Enforcer bronze, Break Starter gold, Brick Wall silver). Where the two sources disagree (Dimer,
// Flash, Float Game, Unpluckable) the badge sits in the middle. Edit freely: it's a judgement call, not game data.
export const META = {
  // Shooting
  set_and_fire: 3, arc_cadence: 3, deadeye: 2, limitless_range: 2, smooth_operator: 1, mini_marksman: 1,
  quick_trigger: 0.5, static_middy: 1, post_fade_phenom: 0.5,
  // Finishing
  posterizer: 3, layup_mixmaster: 1, rise_up: 0.25, paint_prodigy: 0.25, float_game: 0.25, physical_finisher: 1,
  aerial_wizard: 0.25, ghost_stepper: 0.25, hook_specialist: 0.25, post_powerhouse: 0.25, post_spin_catalyst: 0.25,
  // Playmaking
  handles_for_days: 3, lightning_launch: 3, pace: 2, ankle_assassin: 2, versatile_visionary: 2, break_starter: 1,
  bail_out: 0.5, dimer: 0.5, strong_handle: 1, unpluckable: 0.5,
  // Defense
  interceptor: 3, challenger: 3, paint_patroller: 1, immovable_enforcer: 2, pick_dodger: 2, post_lockdown: 0.5,
  seatbelt: 1, high_flying_denier: 1.5, glove: 1, ankle_braces: 1, wall_up: 0.5, off_ball_pest: 0,
  // Rebounding
  sync_snatcher: 1.25, possession_closer: 1, boxout_boss: 0.75, crasher: 1, breaker: 0.25,
  // Physicals
  bruiser: 0.75, pogostick: 1, flash: 1, brick_wall: 0.5, work_horse: 0.25, slippery_offball: 0.5,
  // Contact dunk animations (one "tier" each): dunking is meta. Off two is the common target (87 driving dunk).
  pro_contact_off_two: 2, pro_contact_off_one: 1, elite_contact_off_two: 1, small_contact_off_two: 1,
};
// Badges whose tiers aren't worth the same: per-tier worth (index = tier rank) instead of 1 per tier. Gold Posterizer
// (93 driving dunk) is the one people build for; bronze/silver barely change anything.
// Gold also needs 80 vertical where the contact dunks need 75, so it's worth less than it was.
export const META_TIER = { posterizer: [0, 0.5, 1.25, 2.25, 2.75] };
export const metaTierWorth = (goal, rank) => META_TIER[goal.name]?.[rank] ?? rank;
// Passing badges, close-shot finishing and standing dunks (Rise Up) are lightly weighted on purpose: they're cheap
// to unlock, so with high weights the leftover budget pours into close shot / pass accuracy / standing dunk.
// Role differences: guards (PG/SG) and bigs (PF/C) value different things; SF uses the base table. E.g. Ankle Braces
// and Pick Dodger matter on the perimeter and barely at all for a big; boards and rim badges are the reverse.
export const META_BY_GROUP = {
  guard: { ankle_braces: 2, pick_dodger: 3, mini_marksman: 2, seatbelt: 1.5, slippery_offball: 1, flash: 1.5,
    rise_up: 0.5, paint_prodigy: 1, boxout_boss: 0, possession_closer: 0.25, crasher: 0.5, sync_snatcher: 0.25, brick_wall: 0.5,
    immovable_enforcer: 1, break_starter: 0.5, pogostick: 1, post_lockdown: 0, paint_patroller: 0, wall_up: 0,
    versatile_visionary: 2, dimer: 0.75, bail_out: 0.5, small_contact_off_two: 1.5 },
  big: { ankle_braces: 0.5, pick_dodger: 0.5, seatbelt: 0, mini_marksman: 0, slippery_offball: 0, flash: 0.5,
    handles_for_days: 1, lightning_launch: 1.5, ankle_assassin: 0.5, arc_cadence: 1.5, immovable_enforcer: 2, pace: 0.5, interceptor: 2, challenger: 2,
    boxout_boss: 2, possession_closer: 2, sync_snatcher: 1.25, crasher: 0.5, rise_up: 0.75, high_flying_denier: 2.5, post_lockdown: 2, brick_wall: 2, break_starter: 3, paint_prodigy: 1,
    paint_patroller: 3, wall_up: 1, float_game: 0, bruiser: 1, brick_wall: 1, work_horse: 0.5, pro_contact_off_two: 2, pro_bigman_contact: 1, elite_bigman_contact: 0.5 },
};
// Single positions on top of their group: PGs run the offense, so passing counts more than for an SG.
export const META_BY_POS = { PG: { bail_out: 1, dimer: 1, versatile_visionary: 1 } };
export const metaGroup = position => position === 'PG' || position === 'SG' ? 'guard' : position === 'PF' || position === 'C' ? 'big' : 'wing';

// The game meta for the average player (rec, park, MyCareer): balanced builds you don't need a whole team around — a
// no-defense "cone" isn't meta. Not the min-max meta of organized competitive play.
// Highest tier the meta says is worth buying (1 bronze … 4 HoF); unlisted = HoF.
// Defense on guards/wings: about 83 steal and 85 perimeter D is enough unless it's a lockdown (pick that in the Lab).
// Immovable Enforcer silver (72 perimeter D / 82 strength) is cheap on a big. Sync Snatcher stops at gold: HoF boards
// aren't worth giving up Lightning Launch, speed or perimeter D.
export const META_CAPS = { break_starter: 3, limitless_range: 3, bail_out: 1, brick_wall: 2, immovable_enforcer: 2, sync_snatcher: 3,
  high_flying_denier: 3, interceptor: 2, glove: 2, challenger: 2, pick_dodger: 2, ankle_braces: 2, dimer: 3,
  versatile_visionary: 2, ankle_assassin: 2, handles_for_days: 3, paint_patroller: 2, wall_up: 1, post_lockdown: 1,
  aerial_wizard: 3, paint_prodigy: 2, float_game: 2, ghost_stepper: 2, pogostick: 2 };
// How much meta counts next to your own picks while optimizing (your Normal = 1 per tier; top meta = 3 × 0.25).
export const META_RATE = 0.25;
export const metaOf = (goal, position, mode = '5v5') => {
  const base = META_BY_POS[position]?.[goal.name] ?? META_BY_GROUP[metaGroup(position)]?.[goal.name] ?? META[goal.name] ?? 0;
  const k = mode === '3v3' ? 1 : mode === 'both' ? 0.5 : 0;
  return base * (1 + ((META_3V3[goal.name] ?? 1) - 1) * k);
};

// 3v3 (half court, smaller floor): outlets and transition passing matter less, perimeter quickness more.
export const META_3V3 = { break_starter: 0.3, dimer: 0.8, boxout_boss: 0.8, pick_dodger: 1.3, ankle_braces: 1.3, flash: 1.2 };

// The meta is a badge meta: you go precisely to the ratings badges need. Ratings only count on their own for mobility
// (speed, agility) and, in the casual meta, a perimeter-defense floor of 75 for guards and wings (lower is a cone).
// [weight, target, floor, ceiling]: 3× weight below the floor, full to the target, a quarter to the ceiling, nothing past.
// Everyone: 78+ three (a non-shooter isn't meta, bigs included) and 65+ pass accuracy (lower is unplayable), aiming for
// 80 (silver Versatile Visionary). Bigs: block before interior (Paint Patroller silver 71/84, High-Flying Denier), and
// speed matters for them too. Strength isn't a target: it comes from the badges that use it.
const ATTR = {
  guard: { speed: [1.25, 85], agility: [0.75, 80], perimeter_defense: [1, 75, 75, 75], three_point: [2, 78, 78, 78],
    pass_accuracy: [1.25, 80, 65, 80] },
  wing: { speed: [1.25, 84], agility: [0.75, 78], perimeter_defense: [1, 75, 75, 75], three_point: [2, 78, 78, 78],
    pass_accuracy: [1.25, 80, 65, 80] },
  big: { speed: [2, 80, 72], agility: [0.5, 68], three_point: [2, 78, 78, 78], pass_accuracy: [1.25, 80, 65, 80],
    block: [1, 84, 75, 88], interior_defense: [0.5, 75, 70, 80] },
};
// Below 78 three a build isn't meta at all: the meta score is scaled down 5% per point under it (to 40% at most).
export const shootingGate = three => Math.max(0.4, 1 - 0.05 * Math.max(0, 78 - three));
export const attrMetaFor = (position, height = 80) => {
  const out = { ...ATTR[metaGroup(position)] };
  // Under 6'10" you guard the perimeter whatever the position says: a 6'7" "center" with 45 perimeter D is a cone.
  if (height < 82 && !out.perimeter_defense) out.perimeter_defense = [1, 75, 75, 75];
  return out;
};

// Dunking meta needs the height to dunk: full from 6'4", fading to a quarter at 6'0" and below (a 5'9" PG isn't a
// dunker). Applies to Posterizer, Pogo Stick, Rise Up, Aerial Wizard and the contact dunk / alley-oop animations.
const DUNK_GOALS = new Set(['posterizer', 'pogostick', 'rise_up', 'aerial_wizard']);
// Standing dunks grow with height instead: half worth at 6'10", full at 7'0", 1.5× at 7'4".
const STAND_GOALS = new Set(['rise_up', 'pro_bigman_contact', 'elite_bigman_contact', 'bigman_contact_oop']);
export const dunkFactor = (goal, height) => STAND_GOALS.has(goal.name) ? Math.max(0.5, Math.min(1.5, 0.5 + (height - 82) / 4))
  : !(DUNK_GOALS.has(goal.name) || goal.discipline === 'animation') ? 1
  : Math.max(0.25, Math.min(1, 0.25 + (height - 72) / 4 * 0.75));

// Height meta for ranking results and picking bodies: height decides contests (2KLab's 2K26 testing: height still
// dominates contest effectiveness; wingspan adds ~6%), so the meta peaks at 6'8" and falls off hard below it.
// Below: σ 4.5" (6'6" 0.91, 6'4" 0.67, 6'2" 0.41, 6'0" 0.21, 5'10" 0.08, 5'9" 0.05). Above: σ 7" (7'0" 0.85, 7'4" 0.52).
export const heightMeta = (h, position) => {
  const peak = metaGroup(position) === 'big' ? 83 : 80; // bigs peak at 6'11", everyone else at 6'8"
  return Math.exp(-(((h - peak) / (h < peak ? 4.5 : 7)) ** 2) / 2);
};
// How strongly attribute meta counts relative to feel you set yourself (your Normal = 1).
export const ATTR_META_RATE = 0.4;
// Choosing a frame (weight/wingspan) within a height: caps that matter beyond the attribute meta above, [weight, up to].
// Speed alone would always pick the lightest, shortest frame and cap dunks, defense and boards.
export const FRAME_META = {
  guard: { driving_dunk: [1.5, 93], perimeter_defense: [1.5, 92], steal: [0.75, 90], vertical: [0.5, 80], strength: [0.5, 80] },
  wing: { driving_dunk: [1.5, 93], perimeter_defense: [1.5, 92], steal: [0.75, 90], vertical: [0.75, 85], strength: [0.75, 85] },
  big: { defensive_rebound: [1.5, 95], block: [1.25, 92], interior_defense: [0.5, 88], driving_dunk: [1, 90], strength: [0.75, 88] },
};

// Driving finishes only pay off if you can get downhill: the meta worth of badges that need Driving Dunk or Driving
// Layup scales with Speed With Ball (25% at 55 or less, full at 75+). Derived from each badge's requirements.
export const DRIVE_ATTRS = new Set(['driving_dunk', 'driving_layup']);
export const driveFactor = swb => Math.max(0.25, Math.min(1, (swb - 55) / 20 * 0.75 + 0.25));
export const metaCap = goal => META_CAPS[goal.name] ?? 4;
