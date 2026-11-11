// Role presets for the Lab. General on purpose — a starting point to narrow down — but min-maxed: every badge
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

export const ROLES = [
  {
    id: 'inside-big', label: 'Inside big',
    blurb: 'Boards, rim protection, dunks and outlets, with enough three for Set and Fire. Strength and post moves only as far as they pay.',
    positions: ['PF', 'C'], heights: [81, 86], category: 'shooting',
    values: { ...BIG_BOARDS, ...BIG_DEFENSE, ...SHOOTING, posterizer: 3, rise_up: 1, aerial_wizard: 0.5, physical_finisher: 0.5,
      break_starter: 2, dimer: 1, bail_out: 0.5, pogostick: 1, brick_wall: 1, work_horse: 1, bruiser: 0.5,
      pro_contact_off_two: 2, elite_contact_off_two: 1 },
    caps: { ...COMMON_CAPS, paint_patroller: 2, challenger: 2 },
    continuous: { speed: 2, agility: 2 },
    minimums: { defensive_rebound: 87, pass_accuracy: 75, block: 70, perimeter_defense: 70, three_point: 70, speed: 65, agility: 55 },
    maximums: { driving_layup: 80, standing_dunk: 90, post_control: 75, strength: 85, close_shot: 85 },
  },
  {
    id: 'stretch-big', label: 'Stretch big',
    blurb: 'Floor-spacing big who still rebounds and contests at the rim.',
    positions: ['PF', 'C'], heights: [80, 85], category: 'shooting',
    values: { ...SHOOTING, set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 1, smooth_operator: 0.5,
      boxout_boss: 2, sync_snatcher: 1, possession_closer: 1, high_flying_denier: 1, paint_patroller: 1, challenger: 1,
      brick_wall: 1, pogostick: 0.5, break_starter: 1, dimer: 1, pro_contact_off_two: 1 },
    caps: { ...COMMON_CAPS, paint_patroller: 2, challenger: 2 },
    continuous: { speed: 2, agility: 2 },
    minimums: { defensive_rebound: 80, pass_accuracy: 70, three_point: 80, speed: 70, agility: 60 },
    maximums: { driving_layup: 80, standing_dunk: 85, post_control: 70, strength: 80, close_shot: 85 },
  },
  {
    id: 'lockdown', label: 'Lockdown',
    blurb: 'Guards the other team’s best player: perimeter D, steals, elite speed and agility. Still shoots.',
    positions: ['SG', 'SF'], heights: [76, 80], category: 'shooting',
    values: { ...PERIMETER_D, ...SHOOTING, off_ball_pest: 0, flash: 1, slippery_offball: 0.5, pogostick: 0.5, high_flying_denier: 1,
      posterizer: 1, handles_for_days: 0.5, dimer: 0.5, pro_contact_off_two: 1 },
    caps: { ...COMMON_CAPS },
    continuous: { speed: 3, agility: 3, ball_handle: 1 },
    minimums: { speed: 82, agility: 80, perimeter_defense: 85, steal: 75, three_point: 75 },
    maximums: { standing_dunk: 60, post_control: 60, strength: 75, driving_layup: 85 },
  },
  {
    id: 'wing', label: 'Generalist wing',
    blurb: 'A bit of everything: shoots, defends, finishes, moves the ball. Narrow it down from here.',
    positions: ['SG', 'SF'], heights: [77, 80], category: 'shooting',
    values: { ...SHOOTING, set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 1, challenger: 2, pick_dodger: 1,
      ankle_braces: 1, glove: 1, interceptor: 1, posterizer: 2, aerial_wizard: 0.5, layup_mixmaster: 1, ...HANDLES, dimer: 1,
      flash: 1, pogostick: 0.5, pro_contact_off_two: 2, elite_contact_off_two: 0.5 },
    caps: { ...COMMON_CAPS },
    continuous: { speed: 2, agility: 2, ball_handle: 1 },
    minimums: { speed: 80, agility: 78, three_point: 80, perimeter_defense: 75 },
    maximums: { standing_dunk: 60, post_control: 65, strength: 75, driving_layup: 85 },
  },
  {
    id: 'slasher', label: 'Slasher',
    blurb: 'Contact dunks and finishing off the dribble, with a real three. Handle and speed with ball matter because you have to get there.',
    positions: ['SG', 'SF'], heights: [76, 80], category: 'shooting',
    values: { posterizer: 3, aerial_wizard: 0.5, physical_finisher: 2, layup_mixmaster: 1, float_game: 1, ...HANDLES, lightning_launch: 2,
      set_and_fire: 2, arc_cadence: 1, challenger: 1, pick_dodger: 1, glove: 1, pogostick: 1, flash: 1, slippery_offball: 1,
      pro_contact_off_two: 3, elite_contact_off_two: 2 },
    caps: { ...COMMON_CAPS },
    continuous: { ball_handle: 2, speed_with_ball: 2, speed: 2, agility: 1 },
    minimums: { speed: 82, agility: 78, three_point: 75 },
    maximums: { driving_layup: 85, standing_dunk: 60, post_control: 60, strength: 75 },
  },
  {
    id: 'scorer', label: 'Scorer',
    blurb: 'Three-level bucket: shooting first, then finishing and enough handle to create.',
    positions: ['SG', 'SF'], heights: [76, 80], category: 'shooting',
    values: { set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 2, smooth_operator: 2, static_middy: 1, quick_trigger: 1,
      layup_mixmaster: 1, float_game: 1, posterizer: 1, ...HANDLES, challenger: 1, glove: 0.5, flash: 1, pro_contact_off_two: 1 },
    caps: { ...COMMON_CAPS },
    continuous: { ball_handle: 2, speed: 2, agility: 1 },
    minimums: { speed: 80, agility: 75, three_point: 85, mid_range: 80 },
    maximums: { standing_dunk: 60, post_control: 65, strength: 75 },
  },
  {
    id: 'playmaker', label: 'Playmaker',
    blurb: 'Creator: passing and handles first. Pass accuracy only as high as the badges need — not 99.',
    positions: ['PG', 'SG'], heights: [72, 78], category: 'shooting',
    values: { dimer: 3, bail_out: 2, versatile_visionary: 2, break_starter: 1, ...HANDLES, handles_for_days: 2, ankle_assassin: 2,
      lightning_launch: 2, set_and_fire: 2, deadeye: 1, smooth_operator: 1, arc_cadence: 1, mini_marksman: 1,
      glove: 2, interceptor: 1, challenger: 1, pick_dodger: 1, layup_mixmaster: 1, float_game: 1, flash: 1 },
    caps: { ...COMMON_CAPS, dimer: 3, versatile_visionary: 3, bail_out: 3 },
    continuous: { ball_handle: 3, speed_with_ball: 2, speed: 2, agility: 1 },
    minimums: { speed: 85, agility: 80, pass_accuracy: 80, steal: 70, three_point: 75 },
    maximums: { standing_dunk: 50, post_control: 55, strength: 65, pass_accuracy: 94 },
  },
  {
    id: 'point-guard', label: 'Point guard',
    blurb: 'Great shooting and playmaking with elite speed, okay defense, and a layup or dunk that breakers can finish.',
    positions: ['PG'], heights: [72, 77], category: 'shooting',
    values: { set_and_fire: 3, deadeye: 2, arc_cadence: 2, limitless_range: 1, smooth_operator: 2, quick_trigger: 1, mini_marksman: 1,
      dimer: 2, bail_out: 1, versatile_visionary: 1, ...HANDLES, handles_for_days: 2, ankle_assassin: 2, lightning_launch: 2,
      glove: 1, challenger: 1, pick_dodger: 1, layup_mixmaster: 1, float_game: 1, posterizer: 0.5, flash: 1, pro_contact_off_two: 0.5 },
    caps: { ...COMMON_CAPS, dimer: 3 },
    continuous: { ball_handle: 3, speed_with_ball: 2, speed: 2, agility: 2 },
    minimums: { speed: 85, agility: 82, three_point: 85, pass_accuracy: 75, steal: 65 },
    maximums: { standing_dunk: 50, post_control: 55, strength: 65, pass_accuracy: 92 },
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
      continuousWeights: { ...role.continuous }, minimums: { ...role.minimums }, maximums: { ...role.maximums }, role: role.id },
    cfg: { positions: role.positions, heights: role.heights, category: role.category },
  };
}
