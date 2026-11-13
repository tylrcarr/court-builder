// "Meta" badge worth for NBA 2K27 (0 = not worth points … 3 = top of the meta), used to steer leftover Overall and
// Cap Breakers once your musts, minimums and picks are covered, and for the meta score on results.
// Sources (Nov 2026): Operation Sports "best badges in NBA 2K27, no matter your build" and MMOexp's 2K27 badge tier
// list, where they agree; plus calls made in this project (Set and Fire core, Quick Trigger minor, Off-Ball Pest
// worthless, Immovable Enforcer bronze, Break Starter gold, Brick Wall silver). Where the two sources disagree (Dimer,
// Flash, Float Game, Unpluckable) the badge sits in the middle. Edit freely: it's a judgement call, not game data.
export const META = {
  // Shooting
  set_and_fire: 3, arc_cadence: 3, deadeye: 2, limitless_range: 2, smooth_operator: 1, mini_marksman: 1,
  quick_trigger: 0.5, static_middy: 1, post_fade_phenom: 1,
  // Finishing
  posterizer: 3, layup_mixmaster: 1, rise_up: 0.25, paint_prodigy: 0.25, float_game: 0.25, physical_finisher: 1,
  // Post play isn't meta. Post Control feeds six badges at once (these plus Unpluckable), so even small worths add up to a
  // top badge on one cheap attribute: the optimizer would pour leftover Overall into Post Control on a 6'6" guard.
  aerial_wizard: 0.25, ghost_stepper: 0.05, hook_specialist: 0.05, post_powerhouse: 0.05, post_spin_catalyst: 0.05,
  // Playmaking
  handles_for_days: 3, lightning_launch: 3, pace: 2, ankle_assassin: 2, versatile_visionary: 2, break_starter: 1,
  bail_out: 0.5, dimer: 0.5, strong_handle: 0.5, unpluckable: 0.5,
  // Defense
  interceptor: 3, challenger: 3, paint_patroller: 1, immovable_enforcer: 2, pick_dodger: 2, post_lockdown: 0.5,
  seatbelt: 1, high_flying_denier: 1.5, glove: 1, ankle_braces: 1, wall_up: 0.5, off_ball_pest: 0,
  // Rebounding
  // Box Out Boss: worms aren't a big problem in the game, so it's low meta everywhere.
  sync_snatcher: 1.25, possession_closer: 1, boxout_boss: 0.4, crasher: 1, breaker: 0.25,
  // Physicals
  bruiser: 0.75, pogostick: 1, flash: 1, brick_wall: 0.5, work_horse: 0.25, slippery_offball: 0.5,
  // Contact dunk animations (one "tier" each): dunking is meta. Off two is the common target (87 driving dunk).
  // Elite Contact Off Two (96) is barely worth chasing: 93 already has gold Posterizer, and 94–98 change nothing else.
  pro_contact_off_two: 2, pro_contact_off_one: 1, elite_contact_off_two: 0.25, small_contact_off_two: 1,
};
// Badges whose tiers aren't worth the same: per-tier worth (index = tier rank) instead of 1 per tier. Gold Posterizer
// (93 driving dunk) is the one people build for: a cliff at 93, and HoF (99) barely more, so 94–98 isn't worth paying
// for. Possession Closer works the same way for bigs: gold (95 defensive rebound) is the board that matters, far above
// 90 (a 90-board center isn't close to a 95 one).
// Post Fade Phenom only starts to matter at silver, and even then it's low-normal: worth it when it costs next to nothing.
export const META_TIER = { posterizer: [0, 0.5, 1.25, 3.5, 3.75], possession_closer: [0, 0.5, 1, 4, 4.25],
  post_fade_phenom: [0, 0, 0.6, 0.9, 1.1] };
// A first tier is worth a bit more than later steps: a bronze can be Synergy-boosted (+1) to silver.
export const BRONZE_BONUS = 0.5;
export const metaTierWorth = (goal, rank) => META_TIER[goal.name]?.[rank] ?? (rank ? rank + BRONZE_BONUS : 0);
// Passing badges, close-shot finishing and standing dunks (Rise Up) are lightly weighted on purpose: they're cheap
// to unlock, so with high weights the leftover budget pours into close shot / pass accuracy / standing dunk.
// Role differences: guards (PG/SG) and bigs (PF/C) value different things; SF uses the base table. E.g. Ankle Braces
// and Pick Dodger matter on the perimeter and barely at all for a big; boards and rim badges are the reverse.
export const META_BY_GROUP = {
  guard: { ankle_braces: 2, pick_dodger: 3, mini_marksman: 2, seatbelt: 1.5, slippery_offball: 1, flash: 1.5,
    rise_up: 0.5, paint_prodigy: 0.5, boxout_boss: 0, possession_closer: 0.1, crasher: 0.25, sync_snatcher: 0.1, brick_wall: 0.5,
    immovable_enforcer: 0.75, static_middy: 1.25, deadeye: 2.5, break_starter: 0.5, pogostick: 1, post_lockdown: 0, paint_patroller: 0, wall_up: 0,
    versatile_visionary: 2, dimer: 0.75, bail_out: 0.5, small_contact_off_two: 1.5 },
  big: { ankle_braces: 0.5, pick_dodger: 0.5, seatbelt: 0, mini_marksman: 0, slippery_offball: 0, flash: 0.5,
    handles_for_days: 1, lightning_launch: 1.5, ankle_assassin: 0.5, arc_cadence: 0.75, posterizer: 2, strong_handle: 0.25, unpluckable: 0.1, layup_mixmaster: 0.5, physical_finisher: 0.5, static_middy: 0.75, immovable_enforcer: 2, pace: 0.5, interceptor: 2, challenger: 2,
    boxout_boss: 0.5, possession_closer: 3, sync_snatcher: 1.25, crasher: 1.5, rise_up: 0.75, high_flying_denier: 2.5, post_lockdown: 2, brick_wall: 2, break_starter: 3, paint_prodigy: 0.75,
    paint_patroller: 3, wall_up: 1, float_game: 0, bruiser: 1, brick_wall: 1, work_horse: 0.5, pro_contact_off_two: 1.5, pro_bigman_contact: 1, elite_bigman_contact: 0.5 },
};
// Strength on the perimeter: guards and wings don't buy strength for its own badges. Immovable Enforcer bronze (71) is
// enough (higher tiers only for a real dunker, see STRENGTH_FREE), Brick Wall stops at bronze, and Bruiser / Physical
// Finisher aren't worth strength. Wings sit around 71-76 strength; smaller players need even less (see dunkFactor).
META_BY_GROUP.guard = { ...META_BY_GROUP.guard, immovable_enforcer: 0.75, brick_wall: 0, bruiser: 0, physical_finisher: 0.5, strong_handle: 0.5, breaker: 0 };
META_BY_GROUP.wing = { immovable_enforcer: 1.5, brick_wall: 0.25, bruiser: 0.25, physical_finisher: 0.5, strong_handle: 0.5, breaker: 0.25 };
// Highest meta tier per group, on top of META_CAPS.
export const META_CAPS_BY_GROUP = {
  guard: { immovable_enforcer: 3, brick_wall: 1, bruiser: 1, physical_finisher: 2, strong_handle: 2 },
  wing: { immovable_enforcer: 3, brick_wall: 1, bruiser: 1, physical_finisher: 2, strong_handle: 2 },
};
// Strength tiers above these ranks only count for a driving dunker (93+ full, nothing at 87 or less): Strong Handle means
// nothing if you don't dunk, and 82–85 strength for Immovable Enforcer is a 50/50 against speed even for one who does.
export const STRENGTH_FREE = { guard: { immovable_enforcer: 1, strong_handle: 0 }, wing: { immovable_enforcer: 1, strong_handle: 0 } };
export const dunkGate = dunk => Math.max(0, Math.min(1, (dunk - 87) / 6));
export const strengthFree = (goal, position) => STRENGTH_FREE[metaGroup(position)]?.[goal.name];
// Single positions on top of their group: PGs run the offense, so passing counts more than for an SG.
export const META_BY_POS = { PG: { bail_out: 1, dimer: 1, versatile_visionary: 1 } };
export function metaGroup(position) { return position === 'PG' || position === 'SG' ? 'guard' : position === 'PF' || position === 'C' ? 'big' : 'wing'; }

// The game meta for the average player (rec, park, MyCareer): balanced builds you don't need a whole team around — a
// no-defense "cone" isn't meta. Not the min-max meta of organized competitive play.
// Highest tier the meta says is worth buying (1 bronze … 4 HoF); unlisted = HoF.
// Defense on guards/wings: about 83 steal and 85 perimeter D is enough unless it's a lockdown (pick that in the Lab).
// Immovable Enforcer silver (72 perimeter D / 82 strength) is cheap on a big. Paint Patroller gold (93 block) counts:
// a 95 board / 93 block center should beat a 92 / 92 one. Sync Snatcher stops at gold: HoF boards
// aren't worth giving up Lightning Launch, speed or perimeter D.
// Box Out Boss stops at silver (gold's 88 strength + 90 board is what made bigs carry 89–90 strength); Crasher at silver
// (80 offensive rebound is the board that matters).
export const META_CAPS = { strong_handle: 2, boxout_boss: 2, crasher: 2, break_starter: 3, limitless_range: 3, bail_out: 1, brick_wall: 2, immovable_enforcer: 2, sync_snatcher: 3,
  high_flying_denier: 3, interceptor: 2, glove: 2, challenger: 2, pick_dodger: 2, ankle_braces: 2, dimer: 3,
  versatile_visionary: 2, ankle_assassin: 2, handles_for_days: 3, paint_patroller: 3, wall_up: 1, post_lockdown: 1,
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
// [weight, target, floor, ceiling, hit]: 3× weight below the floor, full to the target, a quarter to the ceiling, nothing
// past; hit = a one-off bonus (in rating points) for reaching the target (a big's 90 board: 89 isn't 90).
// Everyone: 78+ three (a non-shooter isn't meta, bigs included) and 65+ pass accuracy (lower is unplayable), aiming for
// 80 (silver Versatile Visionary). Agility counts for everyone, bigs included (a slow, stiff big is a liability).
// Guards and wings are fast: under 82 / 80 speed is slow for the role (a 6'8" SF at 78 speed isn't meta, whatever badges
// it bought). Wings and bigs need a way to finish: driving dunk counts (see also finishGate).
// Bigs: 87+ defensive rebound and 95 is the target (Possession Closer gold); 90 isn't a stopping point. Bigs: block before interior (Paint Patroller silver 71/84, High-Flying Denier), and
// speed matters for them too. Strength isn't a target: it comes from the badges that use it.
const ATTR = {
  guard: { speed: [2, 88, 82], agility: [1.75, 86, 76], free_throw: [1, 70, 55, 75], perimeter_defense: [1, 75, 75, 75], three_point: [2, 86, 78, 95],
    mid_range: [0.5, 80], ball_handle: [0.75, 90],
    pass_accuracy: [1.25, 80, 65, 80] },
  wing: { speed: [2.5, 86, 80], agility: [1.75, 84, 74], driving_dunk: [0.75, 87, 78], free_throw: [1, 70, 55, 75], mid_range: [0.5, 80], perimeter_defense: [1, 75, 75, 75], three_point: [2, 78, 78, 78],
    pass_accuracy: [1.25, 80, 65, 80] },
  big: { speed: [2.5, 82, 74], agility: [1, 75, 65], defensive_rebound: [2, 95, 87, 95, 12], driving_dunk: [0.75, 85, 75], free_throw: [1, 70, 55, 75], three_point: [2, 78, 78, 78], pass_accuracy: [1.25, 80, 65, 80],
    block: [1, 84, 75, 88], interior_defense: [0.5, 75, 70, 80] },
};
// Below 78 three a build isn't meta at all: the meta score is scaled down 5% per point under it (to 40% at most).
export const shootingGate = three => Math.max(0.4, 1 - 0.05 * Math.max(0, 78 - three));
// No finishing is a liability: the meta score drops 2.5% per point that the better of driving dunk and driving layup is
// under 80 (to 60% at most). Close shot and standing dunks don't count: they don't get you to the rim.
export const FINISH_FLOOR = 80;
export const finishGate = (dunk, layup) => Math.max(0.6, 1 - 0.025 * Math.max(0, FINISH_FLOOR - Math.max(dunk, layup)));
// A big who can't rebound isn't meta, however well they block: bigs (PF/C), and anyone 6'9"+ who doesn't handle (speed
// with ball under 65), lose 3% of their meta score per point of defensive rebound under 85 (to 55% at most: 70 → 55%).
export const REBOUND_FLOOR = 85;
export const reboundGate = (dreb, position, height, swb) => (metaGroup(position) === 'big' || (height >= 81 && swb < 65))
  ? Math.max(0.55, 1 - 0.03 * Math.max(0, REBOUND_FLOOR - dreb)) : 1;
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
// Strength badges matter less the smaller the player: full from 6'8", half at 6'4", a quarter at 6'2" and below.
const STRENGTH_GOALS = new Set(['immovable_enforcer', 'brick_wall', 'bruiser', 'strong_handle']);
export const dunkFactor = (goal, height) => STRENGTH_GOALS.has(goal.name) ? Math.max(0.25, Math.min(1, (height - 72) / 8))
  : STAND_GOALS.has(goal.name) ? Math.max(0.5, Math.min(1.5, 0.5 + (height - 82) / 4))
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
  // Small guards: steals before perimeter D (taller players shoot over you in the contest system), little strength.
  guard: { driving_dunk: [1.5, 93], perimeter_defense: [1, 88], steal: [1.25, 90], vertical: [0.5, 80], strength: [0.1, 70] },
  wing: { driving_dunk: [1.5, 93], perimeter_defense: [1.5, 92], steal: [0.75, 90], vertical: [0.75, 85], strength: [0.25, 76] },
  big: { defensive_rebound: [2.5, 95], block: [1.25, 92], interior_defense: [0.5, 88], driving_dunk: [1, 90], strength: [0.75, 83] },
};

// Driving finishes only pay off if you can get downhill: the meta worth of badges that need Driving Dunk or Driving
// Layup scales with Speed With Ball (25% at 55 or less, full at 75+). Derived from each badge's requirements.
export const DRIVE_ATTRS = new Set(['driving_dunk', 'driving_layup']);
export const driveFactor = swb => Math.max(0.25, Math.min(1, (swb - 55) / 20 * 0.75 + 0.25));
export const metaCap = (goal, position) => META_CAPS_BY_GROUP[metaGroup(position)]?.[goal.name] ?? META_CAPS[goal.name] ?? 4;
// Meta worth of a tier rank with the strength gate applied (dunk = the build's driving dunk).
export function gatedTierWorth(goal, rank, position, dunk) {
  const free = strengthFree(goal, position), w = metaTierWorth(goal, rank);
  if (free == null || rank <= free) return w;
  const base = metaTierWorth(goal, free);
  return base + (w - base) * dunkGate(dunk);
}
