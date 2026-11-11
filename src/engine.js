import data from './rules.json' with { type: 'json' };

export const { attributes, positions, badges } = data;
export const tiers = ['bronze', 'silver', 'gold', 'hall_of_fame'];
export const name = key => key.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
export const feet = inches => Math.floor(inches / 12) + '′' + inches % 12 + '″';
export const empty = () => attributes.map(() => 25);

export function defaultBody(position = 'SG', height = 78) {
  const options = positions[position];
  const row = options.find(option => option.height === height) ?? options[Math.floor(options.length / 2)];
  return { position, height: row.height, weight: Math.round((row.minWeight + row.maxWeight) / 2),
    wingspan: Math.round((row.minWingspan + row.maxWingspan) / 2) };
}

function multiplier(rows, key, attribute, value) {
  if (!rows?.length) return 1;
  const first = rows[0], last = rows.at(-1);
  const from = Math.fround(first.multipliers[attribute] ?? 1);
  const to = Math.fround(last.multipliers[attribute] ?? 1);
  const fraction = Math.fround(Math.max(0, Math.min(1, (value - first[key]) / (last[key] - first[key] || 1))));
  return Math.fround(from + Math.fround(fraction * Math.fround(to - from)));
}

export function capsFor({ height, weight, wingspan }) {
  const tuning = data.caps;
  const f = Math.fround;
  return tuning.attributeOrder.map(attribute => {
    const h = f(tuning.heightMultipliers[height]?.[attribute] ?? 1);
    const w = multiplier(tuning.weightEndpoints[height], 'weight', attribute, weight);
    const s = multiplier(tuning.wingspanEndpoints[height], 'wingspan', attribute, wingspan);
    const value = f(25 + f(f(f(74 * h) * w) * s));
    const floor = Math.floor(value);
    const rounded = value - floor === 0.5 ? floor + floor % 2 : Math.round(value);
    return Math.max(25, Math.min(99, rounded));
  });
}

export function resolveLinks(manual, height) {
  const ratings = [...manual];
  let changed;
  do {
    changed = false;
    for (const [source, target, delta] of data.links[height] ?? []) {
      const minimum = ratings[source] - delta;
      if (ratings[target] < minimum) {
        ratings[target] = minimum;
        changed = true;
      }
    }
  } while (changed);
  return ratings;
}

export function lowerLinkedRatings(manual, height, index, value) {
  const limits = attributes.map(() => 99);
  limits[index] = value;
  let changed;
  do {
    changed = false;
    for (const [source, target, delta] of data.links[height] ?? []) {
      const limit = limits[target] + delta;
      if (limits[source] > limit) {
        limits[source] = limit;
        changed = true;
      }
    }
  } while (changed);
  return manual.map((rating, i) => i === index ? value : Math.min(rating, limits[i]));
}
export function overall(ratings, height) {
  const [[low, high], [start, end]] = data.lerp[height - 64];
  const scales = ratings.map((rating, i) => data.scales[i][rating] ?? 1);
  let best = -Infinity, playerType = 0;
  for (const [type, weights] of data.weights[height].entries()) {
    let numerator = 0, denominator = 0;
    for (let i = 0; i < ratings.length; i++) {
      const weight = weights[i] * scales[i];
      numerator += weight * ratings[i];
      denominator += weight;
    }
    const score = start + (numerator / denominator - low) * (end - start) / (high - low);
    if (score > best + 1e-10) {
      best = score;
      playerType = type;
    }
  }
  return { score: best, playerType };
}

// Score of one archetype (the build's Overall is the best of these; that archetype is its player type).
export function overallAs(ratings, height, type) {
  const [[low, high], [start, end]] = data.lerp[height - 64];
  const weights = data.weights[height][type];
  let numerator = 0, denominator = 0;
  for (let i = 0; i < ratings.length; i++) {
    const weight = weights[i] * (data.scales[i][ratings[i]] ?? 1);
    numerator += weight * ratings[i];
    denominator += weight;
  }
  return start + (numerator / denominator - low) * (end - start) / (high - low);
}
export const playerTypeCount = height => data.weights[height].length;
export const typeWeights = (height, type) => data.weights[height][type];

export function assess(ratings, height, caps) {
  const { score, playerType } = overall(ratings, height);
  const limit = 99;
  const withinCaps = ratings.every((rating, i) => rating <= caps[i]);
  return { score, playerType, limit, withinCaps, fits: withinCaps && score <= limit + 1e-8 };
}

export function ladder(index, rating, cap, height, playerType) {
  const weights = data.weights[height][playerType];
  const maxWeight = Math.max(...weights);
  const proportion = (maxWeight - weights[index]) / maxWeight;
  const gains = [];
  for (let step = 0; step < 5; step++) {
    const factor = 15 + Math.trunc((350 - 14 * rating) / 74);
    const gain = Math.max(0, Math.min(cap - rating, Math.max(1, Math.round(proportion * factor))));
    gains.push(gain);
    rating += gain;
  }
  return gains;
}

export function inHeight(badge, height) {
  return height >= badge.height_inches[0] && height <= badge.height_inches[1];
}

// Expand the left-to-right predicate into alternative sets of rating floors.
export function alternatives(tier) {
  let options = [empty()];
  tier.requirements.forEach((req, i) => {
    const floor = empty();
    floor[req.attribute] = req.minimum;
    if (i === 0 || tier.requirements[i - 1].operator_to_next === 'AND') {
      options = options.map(option => mergeFloors(option, floor));
    } else {
      options.push(floor);
    }
  });
  return options;
}

export function mergeFloors(a, b) {
  return a.map((rating, i) => Math.max(rating, b[i]));
}

export function badgeTier(badge, ratings, height) {
  if (!inHeight(badge, height)) return null;
  return badge.tiers.findLast(tier => alternatives(tier).some(option =>
    option.every((minimum, i) => ratings[i] >= minimum)))?.tier ?? null;
}



