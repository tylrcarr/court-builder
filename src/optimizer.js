import { alternatives, assess, capsFor, defaultBody, inHeight, ladder, mergeFloors, positions, resolveLinks } from './engine.js';

function allocate(ratings, caps, target, height, playerType, specialization, attributes) {
  const final = [...ratings], uses = [];
  let general = 0, specialized = 0, shortfall = 0;
  for (let i = 0; i < ratings.length; i++) {
    if (ratings[i] >= target[i]) continue;
    const gains = ladder(i, ratings[i], caps[i], height, playerType);
    for (const gain of gains) {
      if (final[i] >= target[i] || gain === 0) break;
      final[i] += gain;
      const eligible = attributes[i].discipline === specialization.category || attributes[i].name === 'free_throw';
      const restricted = eligible && specialized < specialization.count;
      if (restricted) specialized++;
      else general++;
      uses.push({ index: i, gain, restricted });
    }
    shortfall += Math.max(0, target[i] - final[i]);
  }
  return { final, uses, general, specialized, shortfall };
}

function targetAlternatives(goals, badgeGoals, height) {
  let targets = [goals];
  for (const { badge, tier } of badgeGoals) {
    if (!inHeight(badge, height)) return [];
    const branches = alternatives(badge.tiers.find(option => option.tier === tier));
    const unique = new Map();
    for (const target of targets) for (const branch of branches) {
      const merged = mergeFloors(target, branch);
      unique.set(merged.join(','), merged);
    }
    targets = [...unique.values()].sort((a, b) =>
      a.reduce((sum, value) => sum + value, 0) - b.reduce((sum, value) => sum + value, 0)).slice(0, 24);
  }
  return targets;
}

function searchFrame({ body, goals, badgeGoals, budget, specialization, attributes }) {
  const caps = capsFor(body);
  const targets = targetAlternatives(goals, badgeGoals, body.height)
    .filter(target => target.every((rating, i) => rating <= caps[i]));
  const found = new Map();
  let checked = 0;
  for (const target of targets) {
    const seen = new Set();
    function evaluate(seed) {
      const key = seed.join(',');
      if (seen.has(key)) return null;
      seen.add(key);
      const base = resolveLinks(seed, body.height);
      const budgetState = assess(base, body.height, caps);
      if (!budgetState.withinCaps) return null;
      const plan = allocate(base, caps, target, body.height, budgetState.playerType, specialization, attributes);
      checked++;
      if (plan.shortfall === 0 && plan.general <= budget && budgetState.fits) {
        found.set(base.join(','), { body, base, seed, budgetState, ...plan });
      }
      return { seed, priority: budgetState.score + Math.max(0, plan.general - budget) * 6 + plan.shortfall * 4 };
    }
    let beam = [evaluate(target)].filter(Boolean);
    for (let round = 0; round < 18 && beam.length; round++) {
      const next = [];
      for (const { seed } of beam) {
        for (let i = 0; i < seed.length; i++) {
          if (seed[i] === 25 || target[i] === 25) continue;
          for (const drop of [1, 3, 6, 10]) {
            const candidate = [...seed];
            candidate[i] = Math.max(25, seed[i] - drop);
            const state = evaluate(candidate);
            if (state) next.push(state);
          }
        }
      }
      next.sort((a, b) => a.priority - b.priority);
      beam = next.slice(0, 36);
    }
  }
  const ranked = [...found.values()].sort((a, b) => a.budgetState.score - b.budgetState.score || a.uses.length - b.uses.length);
  const fewest = [...ranked].sort((a, b) => a.uses.length - b.uses.length || a.budgetState.score - b.budgetState.score)[0];
  const results = [...new Set([ranked[0], fewest, ...ranked])].filter(Boolean).slice(0, 5);
  return { checked, results };
}

export function optimize(options) {
  const { body, searchFrames } = options;
  const frames = [body];
  if (searchFrames) {
    for (const row of positions[body.position]) {
      const mid = defaultBody(body.position, row.height);
      frames.push(mid,
        { ...mid, weight: row.minWeight, wingspan: row.minWingspan },
        { ...mid, weight: row.maxWeight, wingspan: row.maxWingspan });
    }
  }
  const unique = new Map(frames.map(frame => [[frame.height, frame.weight, frame.wingspan].join(':'), frame]));
  const searches = [...unique.values()].map(frame => searchFrame({ ...options, body: frame }));
  const plans = searches.flatMap(search => search.results);
  const compare = (a, b) => a.budgetState.score - a.budgetState.limit - (b.budgetState.score - b.budgetState.limit);
  const cheapest = plans.sort(compare)[0];
  const fewest = [...plans].sort((a, b) => a.uses.length - b.uses.length || compare(a, b))[0];
  return { checked: searches.reduce((sum, search) => sum + search.checked, 0), frames: unique.size,
    results: [...new Set([cheapest, fewest, ...plans])].filter(Boolean).slice(0, 5) };
}
