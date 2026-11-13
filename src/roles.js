// Role presets for the Lab. Each one asks only for what defines the role (its own minimums and badges) and lets the
// Lab's meta fill in the rest: no blanket shooting or passing floors. Min-maxed: every badge
// not listed is "don't care" ('*': 0), caps mark badges where a lower tier is all you need (Break Starter gold
// saves 8 pass accuracy over HoF, Brick Wall silver), maximums stop money going into ratings that don't pay
// (a 99 layup next to a dunk, 99 standing dunk on a wing), and every role shoots: nobody builds a non-shooter.
const SHOOTING = { set_and_fire: 3, arc_cadence: 1, deadeye: 1, quick_trigger: 0.5, static_middy: 0.5 };
const BIG_BOARDS = { boxout_boss: 3, sync_snatcher: 2, possession_closer: 2, crasher: 1, breaker: 0.5 };
const BIG_DEFENSE = { paint_patroller: 2, high_flying_denier: 2, challenger: 1, wall_up: 1, post_lockdown: 0.5, immovable_enforcer: 1 };
const PERIMETER_D = { challenger: 3, pick_dodger: 2, ankle_braces: 2, glove: 2, interceptor: 2, seatbelt: 1 };
const HANDLES = { handles_for_days: 1, ankle_assassin: 1, lightning_launch: 1, strong_handle: 1, pace: 1, unpluckable: 1 };
const COMMON_CAPS = { break_starter: 3, brick_wall: 2, immovable_enforcer: 1, layup_mixmaster: 2, post_lockdown: 1, bruiser: 2,
  breaker: 1, rise_up: 3, physical_finisher: 3, aerial_wizard: 3, pogostick: 3, high_flying_denier: 3 };

export const MODES = [['5v5', '5v5'], ['3v3', '3v3'], ['both', 'Both']];

// group: where the preset sits in the picker (guards, wings, bigs). arms: 'max' keeps every body at its longest wingspan.
export const ROLE_GROUPS = [['guard', 'Guards'], ['wing', 'Wings'], ['big', 'Bigs']];
export const ROLES = [
  // ------------------------------------------------------------------ guards
  {
    id: 'point-guard', label: 'Point guard', group: 'guard', icon: '🎯',
    blurb: 'Great shooting and playmaking with elite speed, okay defense, and gold Lightning Launch (silver is still fine). Paint Patroller bronze at most.',
    positions: ['PG'], heights: [72, 77], category: 'shooting',
    values: { set_and_fire: 3, deadeye: 2, arc_cadence: 1.5, limitless_range: 1.5, smooth_operator: 2, quick_trigger: 1, mini_marksman: 1,
      dimer: 2, bail_out: 1, versatile_visionary: 1, ...HANDLES, handles_for_days: 2, ankle_assassin: 2, lightning_launch: 3,
      glove: 1, challenger: 1, pick_dodger: 1, layup_mixmaster: 1, float_game: 1, posterizer: 0.5, flash: 1, pro_contact_off_two: 0.5,
      paint_patroller: 0.25 },
    caps: { ...COMMON_CAPS, dimer: 3, paint_patroller: 1 },
    continuous: { ball_handle: 3, speed_with_ball: 2, speed: 2, agility: 2 },
    minimums: { speed: 85, three_point: 86, pass_accuracy: 75, speed_with_ball: 75 },
    maximums: { standing_dunk: 50, post_control: 55, pass_accuracy: 92 },
  },
  {
    id: 'playmaker', label: 'Playmaker', group: 'guard', icon: '🪄',
    blurb: 'Small creator (6\'0"–6\'4"): outstanding three, handle and speed are required; with those it lets go of the dunk, then some speed or defense, for passing and steals.',
    positions: ['PG', 'SG'], heights: [72, 76], category: 'shooting',
    values: { dimer: 3, bail_out: 2, versatile_visionary: 2, break_starter: 1, ...HANDLES, handles_for_days: 3, ankle_assassin: 2,
      lightning_launch: 3, set_and_fire: 3, limitless_range: 2, deadeye: 1, smooth_operator: 1, arc_cadence: 1, mini_marksman: 1,
      glove: 2, interceptor: 3, challenger: 1, pick_dodger: 1, layup_mixmaster: 1, float_game: 1, flash: 1 },
    caps: { ...COMMON_CAPS, dimer: 3, versatile_visionary: 3, bail_out: 3, paint_patroller: 1 },
    continuous: { ball_handle: 2, speed_with_ball: 2, steal: 1.5, speed: 1, agility: 1 },
    // The non-negotiables: 89 three (gold Set and Fire), 95 handle, 85 speed. Past those, speed and defense can give.
    minimums: { three_point: 89, ball_handle: 95, speed: 85, pass_accuracy: 85, speed_with_ball: 85 },
    maximums: { standing_dunk: 50, post_control: 55, pass_accuracy: 94, driving_dunk: 70 },
  },
  {
    id: 'small-guard', label: 'Small guard', group: 'guard', icon: '⚡',
    blurb: 'Under 6\'4": shooting and handles first, no dunk. Perimeter D is what gets sacrificed; steals stay (smaller guards get more out of them).',
    positions: ['PG', 'SG'], heights: [69, 75], category: 'shooting',
    values: { ...SHOOTING, set_and_fire: 3, limitless_range: 3, deadeye: 2, arc_cadence: 2, mini_marksman: 2, smooth_operator: 1,
      ...HANDLES, handles_for_days: 3, ankle_assassin: 2, lightning_launch: 3, interceptor: 2, glove: 1, pick_dodger: 1, layup_mixmaster: 1,
      float_game: 1, dimer: 1 },
    caps: { ...COMMON_CAPS, paint_patroller: 1 },
    continuous: { three_point: 1.5, ball_handle: 2, speed: 2, steal: 1, agility: 1 },
    minimums: { three_point: 92, ball_handle: 92, speed: 87, speed_with_ball: 80 },
    maximums: { driving_dunk: 55, standing_dunk: 40, post_control: 50 },
  },
  {
    id: 'sharpshooter', label: 'Sharpshooter', group: 'guard', icon: '🏹',
    blurb: 'An insane three (95+): Limitless gold, Deadeye, Set and Fire. Handle and defense only as far as they fit; dunk 87 at most, or none.',
    positions: ['PG', 'SG', 'SF'], heights: [74, 80], category: 'shooting',
    values: { set_and_fire: 3, limitless_range: 3, deadeye: 3, arc_cadence: 2, quick_trigger: 1, smooth_operator: 2, mini_marksman: 1, static_middy: 1,
      handles_for_days: 1, lightning_launch: 1, pace: 1, challenger: 1, interceptor: 1, slippery_offball: 1.5 },
    caps: { ...COMMON_CAPS, paint_patroller: 1 },
    continuous: { three_point: 2, speed: 1.5, agility: 1 },
    minimums: { three_point: 95, mid_range: 75, speed: 80 },
    maximums: { driving_dunk: 87, standing_dunk: 50, post_control: 55 },
  },
  // ------------------------------------------------------------------ wings
  {
    id: 'slasher', label: 'Slasher', group: 'wing', icon: '🔥',
    blurb: 'Elite contact dunks off the dribble (96, aiming for 99), enough handle to get there and passing to kick out. A lower mid-range is fine.',
    positions: ['SG', 'SF'], heights: [76, 80], category: 'shooting',
    values: { posterizer: 3, aerial_wizard: 0.5, physical_finisher: 2, layup_mixmaster: 1, float_game: 1, ...HANDLES, lightning_launch: 2,
      set_and_fire: 2, arc_cadence: 1, challenger: 1, pick_dodger: 1, pogostick: 1, flash: 1, slippery_offball: 1, dimer: 1.5, break_starter: 1,
      pro_contact_off_two: 3, elite_contact_off_two: 3, elite_contact_off_one: 2.5 },
    caps: { ...COMMON_CAPS, break_starter: 2 },
    continuous: { ball_handle: 2, speed_with_ball: 2, speed: 2, strength: 1.5, vertical: 1, agility: 1 },
    minimums: { driving_dunk: 96, vertical: 82, pass_accuracy: 77, speed_with_ball: 75 },
    maximums: { driving_layup: 85, standing_dunk: 60, post_control: 60, steal: 85, mid_range: 75 },
  },
  {
    id: 'bulldozer', label: 'Bulldozing slasher', group: 'wing', icon: '🦬',
    blurb: 'A 99 dunk through contact: high strength (Physical Finisher, Bruiser, Strong Handle, Immovable Enforcer) over quickness.',
    positions: ['SF', 'PF'], heights: [78, 81], category: 'shooting',
    values: { posterizer: 3, physical_finisher: 3, bruiser: 2, strong_handle: 2, immovable_enforcer: 2, brick_wall: 1, aerial_wizard: 0.5,
      pogostick: 1, set_and_fire: 2, handles_for_days: 1, lightning_launch: 1, challenger: 1, possession_closer: 1,
      pro_contact_off_two: 3, elite_contact_off_two: 3, elite_contact_off_one: 3 },
    caps: { ...COMMON_CAPS, physical_finisher: 4, bruiser: 3, immovable_enforcer: 3 },
    continuous: { strength: 2, speed_with_ball: 1.5, speed: 1, vertical: 1 },
    minimums: { driving_dunk: 99, strength: 85, vertical: 80, speed_with_ball: 72, three_point: 78 },
    maximums: { driving_layup: 85, standing_dunk: 75, post_control: 65, mid_range: 75 },
  },
  {
    id: 'lockdown', label: 'Two-way lockdown', group: 'wing', icon: '🛡️',
    blurb: 'Locks up the other team\'s best player and still plays offense: speed, perimeter D, steals and blocks, with strength where it helps (Immovable Enforcer).',
    positions: ['SG', 'SF'], heights: [76, 81], category: 'shooting',
    values: { ...PERIMETER_D, high_flying_denier: 2.5, paint_patroller: 1, immovable_enforcer: 2, brick_wall: 0.5, off_ball_pest: 0 },
    caps: { ...COMMON_CAPS, high_flying_denier: 4, immovable_enforcer: 3 },
    continuous: { speed: 3, agility: 3, block: 1.5, steal: 1, vertical: 1, strength: 0.5 },
    minimums: { speed: 82, agility: 80, perimeter_defense: 85, steal: 80, block: 70 },
    maximums: { standing_dunk: 60, post_control: 60 },
  },
  {
    id: 'pure-lockdown', label: 'Pure lockdown', group: 'wing', icon: '🔒',
    blurb: 'All defense: gold Challenger, steals, blocks, strength and boards. No finishing and a lower three (Set and Fire silver) to pay for it.',
    positions: ['SG', 'SF', 'PF'], heights: [77, 81], category: 'shooting',
    values: { ...PERIMETER_D, challenger: 3, interceptor: 3, high_flying_denier: 3, paint_patroller: 1.5, immovable_enforcer: 3, brick_wall: 1,
      possession_closer: 1, sync_snatcher: 0.5, set_and_fire: 1, off_ball_pest: 0 },
    caps: { ...COMMON_CAPS, high_flying_denier: 4, immovable_enforcer: 4, set_and_fire: 2 },
    continuous: { speed: 2, agility: 2, block: 1.5, strength: 1, defensive_rebound: 1, steal: 1 },
    minimums: { perimeter_defense: 92, steal: 85, block: 80, speed: 80, agility: 78, three_point: 78 },
    maximums: { driving_dunk: 70, driving_layup: 70, close_shot: 65, mid_range: 65, standing_dunk: 60, post_control: 55, three_point: 82 },
  },
  {
    id: 'wing', label: 'Generalist wing', group: 'wing', icon: '🧩',
    blurb: 'A bit of everything: shoots, defends, finishes, moves the ball. Narrow it down from here.',
    positions: ['SG', 'SF'], heights: [77, 80], category: 'shooting',
    values: { ...SHOOTING, set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 1, challenger: 2, pick_dodger: 1,
      ankle_braces: 1, glove: 1, interceptor: 1, posterizer: 2, aerial_wizard: 0.5, layup_mixmaster: 1, ...HANDLES, dimer: 1,
      flash: 1, pogostick: 0.5, pro_contact_off_two: 2, elite_contact_off_two: 0.5 },
    caps: { ...COMMON_CAPS },
    continuous: { speed: 2, agility: 2, ball_handle: 1 },
    minimums: { three_point: 80, perimeter_defense: 75 },
    maximums: { standing_dunk: 60, post_control: 65, driving_layup: 85 },
  },
  {
    id: 'scorer', label: 'Scorer', group: 'wing', icon: '🪣',
    blurb: 'Three-level bucket: shooting first, then finishing and enough handle to create.',
    positions: ['SG', 'SF'], heights: [76, 80], category: 'shooting',
    values: { set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 2, smooth_operator: 2, static_middy: 1, quick_trigger: 1,
      layup_mixmaster: 1, float_game: 1, posterizer: 1, ...HANDLES, challenger: 1, glove: 0.5, flash: 1, pro_contact_off_two: 1 },
    caps: { ...COMMON_CAPS },
    continuous: { ball_handle: 2, speed: 2, agility: 1 },
    minimums: { three_point: 86, mid_range: 80 },
    maximums: { standing_dunk: 60, post_control: 65 },
  },
  // ------------------------------------------------------------------ bigs
  {
    id: 'inside-big', label: 'Inside big', group: 'big', icon: '🧱',
    blurb: '6\'10"–7\'4", longest arms: both boards (93 offensive), rim protection aiming for gold Paint Patroller, a real close shot, some post control. A 78–80 three is enough.',
    positions: ['PF', 'C'], heights: [82, 88], category: 'shooting', arms: 'max',
    values: { ...BIG_BOARDS, crasher: 3, possession_closer: 3, ...BIG_DEFENSE, paint_patroller: 3, set_and_fire: 1.5, rise_up: 1.5, posterizer: 2,
      paint_prodigy: 1, aerial_wizard: 0.5, physical_finisher: 0.5, break_starter: 2, dimer: 1, bail_out: 0.5, pogostick: 1, brick_wall: 1,
      work_horse: 1, bruiser: 0.5, hook_specialist: 0.5, post_powerhouse: 0.5, pro_contact_off_two: 1.5, pro_bigman_contact: 1.5 },
    caps: { ...COMMON_CAPS, paint_patroller: 3, challenger: 2, set_and_fire: 2, crasher: 3 },
    continuous: { offensive_rebound: 1.5, close_shot: 1, speed: 2.5, agility: 1.5 },
    minimums: { defensive_rebound: 90, offensive_rebound: 85, block: 84, interior_defense: 77, close_shot: 75, three_point: 78 },
    maximums: { driving_layup: 80, standing_dunk: 90, post_control: 75, mid_range: 75, three_point: 82 },
  },
  {
    id: 'stretch-big', label: 'Stretch big', group: 'big', icon: '📏',
    blurb: 'Floor-spacing big: 89+ three (gold Set and Fire, Limitless silver), defensive boards 87–90 (85 at 7\'4"), offensive board 80 at most, rim contests.',
    positions: ['PF', 'C'], heights: [80, 88], category: 'shooting',
    values: { ...SHOOTING, set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 2.5, smooth_operator: 0.5,
      boxout_boss: 0.5, sync_snatcher: 1, possession_closer: 2.5, high_flying_denier: 1, paint_patroller: 1.5, challenger: 1,
      brick_wall: 1, pogostick: 0.5, break_starter: 1, dimer: 1, pro_contact_off_two: 1 },
    caps: { ...COMMON_CAPS, paint_patroller: 2, challenger: 2, possession_closer: 3 },
    continuous: { three_point: 1.5, defensive_rebound: 1, speed: 1, agility: 1 },
    minimums: { three_point: 89, defensive_rebound: 85 },
    maximums: { driving_layup: 80, standing_dunk: 85, post_control: 70, close_shot: 85, offensive_rebound: 80 },
  },
  {
    id: 'post-scorer', label: 'Post scorer', group: 'big', icon: '🏋️',
    blurb: 'Min-maxed back-to-the-basket scorer, as tall as you like: post control, hooks and fades, with the strength to back people down.',
    positions: ['PF', 'C'], heights: [80, 88], category: 'shooting',
    values: { post_powerhouse: 3, post_spin_catalyst: 2, hook_specialist: 3, post_fade_phenom: 2.5, ghost_stepper: 2, aerial_wizard: 1,
      rise_up: 2, paint_prodigy: 1.5, bruiser: 2, brick_wall: 2, physical_finisher: 1, possession_closer: 2, boxout_boss: 1, crasher: 1.5,
      paint_patroller: 1, set_and_fire: 1, pro_bigman_contact: 1.5 },
    caps: { ...COMMON_CAPS, bruiser: 3, brick_wall: 3 },
    continuous: { post_control: 2, strength: 2, close_shot: 1 },
    minimums: { post_control: 85, strength: 85, close_shot: 80, defensive_rebound: 85 },
    maximums: { driving_dunk: 75, driving_layup: 75, ball_handle: 60, speed_with_ball: 60 },
  },
  {
    id: 'athletic-big', label: 'Athletic tall big', group: 'big', icon: '🦒',
    blurb: '7\'0"+ who runs the floor: speed, driving dunks and Posterizer with blocks and boards — not a back-to-the-basket or pure-board big.',
    positions: ['PF', 'C'], heights: [84, 88], category: 'shooting', arms: 'max',
    values: { posterizer: 3, pogostick: 1.5, rise_up: 1, aerial_wizard: 1, physical_finisher: 1, high_flying_denier: 3, paint_patroller: 2,
      challenger: 1.5, possession_closer: 2.5, crasher: 1, lightning_launch: 1, set_and_fire: 1.5, break_starter: 1,
      pro_contact_off_two: 3, pro_bigman_contact: 1, elite_contact_off_two: 1 },
    caps: { ...COMMON_CAPS, paint_patroller: 3, high_flying_denier: 4 },
    continuous: { speed: 2.5, agility: 2, vertical: 1.5, driving_dunk: 1 },
    minimums: { driving_dunk: 87, block: 84, defensive_rebound: 87, speed: 76, vertical: 75, three_point: 78 },
    maximums: { post_control: 60, standing_dunk: 85, mid_range: 70 },
  },
];

// Mode adjustments: half-court 3v3 courts are smaller (outlet passes and transition matter less, switching
// and quickness matter more). 'both' averages the two.
const THREE = { values: { break_starter: 0.3, dimer: 0.8, boxout_boss: 0.8, pick_dodger: 1.3, ankle_braces: 1.3 },
  feel: { speed: 1.3, agility: 1.3 } };
export function withMode(prefs, mode = '5v5') {
  if (mode === '5v5') return prefs;
  const k = mode === '3v3' ? 1 : 0.5; // 'both' = halfway
  const scale = (v, f) => v * (1 + (f - 1) * k);
  const values = { ...prefs.values };
  for (const [name, f] of Object.entries(THREE.values)) if (values[name] != null) values[name] = scale(values[name], f);
  const continuousWeights = { ...prefs.continuousWeights };
  for (const [name, f] of Object.entries(THREE.feel)) if (prefs.continuous.includes(name)) continuousWeights[name] = scale(continuousWeights[name] ?? 1, f);
  return { ...prefs, values, continuousWeights };
}

// Turn a role into Lab prefs + config patches.
export function applyRole(role) {
  return {
    prefs: { values: { '*': 0, ...role.values }, caps: { ...role.caps }, continuous: Object.keys(role.continuous),
      continuousWeights: { ...role.continuous }, minimums: { ...role.minimums }, maximums: { ...role.maximums }, role: role.id, arms: role.arms ?? null },
    cfg: { positions: role.positions, heights: role.heights, category: role.category },
  };
}
