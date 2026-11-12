// Animation unlocks treated as one-tier "goals" with the same shape as badges, so breakpoints, the optimizer
// and trimming all respect them. Source: nba2klab.com's 2K27 contact dunk / alley-oop requirements table
// (Driving Dunk, Standing Dunk, height range, Vertical). "Any" columns are left out.
const A = { driving_dunk: 2, standing_dunk: 3, vertical: 20 };
const goal = (id, key, label, height, mins, group) => ({
  badge: 1000 + id, name: key, label, discipline: 'animation', group, height_inches: height, allowed: true,
  note: 'nba2klab 2K27 table: ' + Object.entries(mins).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(', '),
  tiers: [{ badge: 1000 + id, name: key, tier: 'bronze',
    requirements: Object.entries(mins).map(([k, v]) => ({ attribute: A[k], name: k, minimum: v, operator_to_next: 'AND' })) }],
});
const ALL = [69, 88], SMALL = [69, 76], BIG = [82, 88]; // 5'9–7'4, 5'9–6'4, 6'10–7'4

export const animations = [
  goal(1, 'pro_contact_off_two', 'Pro contact dunks off two', ALL, { driving_dunk: 87, vertical: 75 }, 'Contact dunks'),
  goal(2, 'elite_contact_off_two', 'Elite contact dunks off two', ALL, { driving_dunk: 96, vertical: 82 }, 'Contact dunks'),
  goal(3, 'small_contact_off_two', 'Small contact dunks off two', SMALL, { driving_dunk: 86, vertical: 75 }, 'Contact dunks'),
  goal(4, 'pro_contact_off_one', 'Pro contact dunks off one', ALL, { driving_dunk: 89, vertical: 78 }, 'Contact dunks'),
  goal(5, 'elite_contact_off_one', 'Elite contact dunks off one', ALL, { driving_dunk: 99, vertical: 90 }, 'Contact dunks'),
  goal(6, 'small_contact_off_one', 'Small contact dunks off one', SMALL, { driving_dunk: 93, vertical: 80 }, 'Contact dunks'),
  goal(7, 'pro_bigman_contact', 'Pro bigman contact dunks', BIG, { standing_dunk: 80, vertical: 60 }, 'Contact dunks'),
  goal(8, 'elite_bigman_contact', 'Elite bigman contact dunks', BIG, { standing_dunk: 90, vertical: 70 }, 'Contact dunks'),
  goal(9, 'pro_contact_oop', 'Pro contact alley-oop', ALL, { driving_dunk: 84, vertical: 70 }, 'Alley-oops'),
  goal(10, 'elite_contact_oop', 'Elite contact alley-oop', ALL, { driving_dunk: 92, vertical: 80 }, 'Alley-oops'),
  goal(11, 'small_contact_oop', 'Small contact alley-oop', SMALL, { driving_dunk: 86, vertical: 85 }, 'Alley-oops'),
  goal(12, 'bigman_contact_oop', 'Bigman contact alley-oop', BIG, { driving_dunk: 70, standing_dunk: 85, vertical: 60 }, 'Alley-oops'),
];

// Old keys (one "Pro"/"Elite" row at 90/96 Driving Dunk) map to the off-two packages.
export const RENAMED = { pro_contact_dunks: 'pro_contact_off_two', elite_contact_dunks: 'elite_contact_off_two' };
export const isAnimation = goal => goal.discipline === 'animation';
