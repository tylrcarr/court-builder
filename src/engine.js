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

// Hot paths (the optimizers call these millions of times): link tables as flat typed arrays per height, rating scales as
// arrays, each archetype's top weight cached. Same arithmetic, in the same order, as the plain versions.
const linkCache = [], sourceCache = [];
function flatLinks(height) {
  let t = linkCache[height];
  if (!t) {
    const rows = data.links[height] ?? [];
    t = new Int32Array(rows.length * 3);
    rows.forEach(([s, g, d], k) => { t[3 * k] = s; t[3 * k + 1] = g; t[3 * k + 2] = d; });
    linkCache[height] = t;
  }
  return t;
}
// Links grouped by source: [target, δ, target, δ, …] per attribute.
function linksFrom(height) {
  let t = sourceCache[height];
  if (!t) {
    t = attributes.map((_, i) => Int32Array.from((data.links[height] ?? []).filter(l => l[0] === i).flatMap(([, g, d]) => [g, d])));
    sourceCache[height] = t;
  }
  return t;
}
const targetCache = [];
function linksTo(height) {
  let t = targetCache[height];
  if (!t) {
    t = attributes.map((_, i) => Int32Array.from((data.links[height] ?? []).filter(l => l[1] === i).flatMap(([s, , d]) => [s, d])));
    targetCache[height] = t;
  }
  return t;
}
// Lower one manual rating of an already-resolved vector (`manual` = the manual ratings after the change). Returns null
// when some other rating was being held up by this one (then everything downstream must be re-resolved: full path).
// Same exactness condition as raiseResolved.
export function lowerResolved(resolved, manual, height, i) {
  const from = linksFrom(height)[i], to = linksTo(height)[i];
  for (let k = 0; k < from.length; k += 2) {
    const g = from[k];
    if (resolved[g] === resolved[i] - from[k + 1] && resolved[g] > manual[g]) return null;
  }
  let v = manual[i];
  for (let k = 0; k < to.length; k += 2) v = Math.max(v, resolved[to[k]] - to[k + 1]);
  const r = resolved.slice();
  r[i] = v;
  return r;
}
// Raise one rating of an already-resolved vector and propagate its linked minimums (only increases). Returns null when
// the result would differ from clampLinks on the raised manual ratings (something would hit a cap): use the full path.
// Exact when `resolved` is resolveLinks of the manual ratings with nothing clamped (see clampLinks in solver.js).
// caps = null: no cap checks (for an unclamped resolved vector).
export function raiseResolved(resolved, height, i, value, caps = null) {
  if (caps && value > caps[i]) return null;
  const r = resolved.slice(), from = linksFrom(height);
  r[i] = value;
  const stack = [i];
  while (stack.length) {
    const s = stack.pop(), list = from[s];
    for (let k = 0; k < list.length; k += 2) {
      const g = list[k], m = r[s] - list[k + 1];
      if (r[g] < m) {
        if (caps && m > caps[g]) return null;
        r[g] = m; stack.push(g);
      }
    }
  }
  return r;
}
// raiseResolved(resolved, height, i, value) (no caps) followed by capping, without allocating: writes the base ratings that
// change (min(new resolved, cap) ≠ base) as ascending indices into at[] with their new values in to[], returns how many.
// The new resolved vector is left in RAISED (valid until the next call). For scoring trials in an inner loop (scoresAfter).
export const RAISED = new Int32Array(64);
const raiseStack = [];
export function raiseTrial(resolved, base, caps, height, i, value, at, to) {
  const r = RAISED, from = linksFrom(height), n = resolved.length;
  for (let k = 0; k < n; k++) r[k] = resolved[k];
  r[i] = value;
  raiseStack.length = 0; raiseStack.push(i);
  while (raiseStack.length) {
    const s = raiseStack.pop(), list = from[s];
    for (let k = 0; k < list.length; k += 2) {
      const g = list[k], m = r[s] - list[k + 1];
      if (r[g] < m) { r[g] = m; raiseStack.push(g); }
    }
  }
  let c = 0;
  for (let k = 0; k < n; k++) { const v = r[k] < caps[k] ? r[k] : caps[k]; if (v !== base[k]) { at[c] = k; to[c] = v; c++; } }
  return c;
}
// resolveLinks into a scratch vector (worklist propagation: the same least fixpoint as resolveLinks's repeated passes,
// since every link only raises a target toward a fixed minimum), with one rating replaced: manual[i] → value.
// Then writes the base ratings that change against `base` (min(resolved, cap) ≠ base) into at[] / to[] like raiseTrial.
const RESOLVED = new Float64Array(64), resolveStack = [];
export function resolveTrial(manual, i, value, height, base, caps, at, to) {
  const r = RESOLVED, from = linksFrom(height), n = manual.length;
  resolveStack.length = 0;
  for (let k = 0; k < n; k++) { r[k] = manual[k]; resolveStack.push(k); }
  r[i] = value;
  while (resolveStack.length) {
    const s = resolveStack.pop(), list = from[s];
    for (let k = 0; k < list.length; k += 2) {
      const g = list[k], m = r[s] - list[k + 1];
      if (r[g] < m) { r[g] = m; resolveStack.push(g); }
    }
  }
  let c = 0;
  for (let k = 0; k < n; k++) { const v = r[k] < caps[k] ? r[k] : caps[k]; if (v !== base[k]) { at[c] = k; to[c] = v; c++; } }
  return c;
}
const scaleTable = data.scales.map(s => Float64Array.from({ length: 100 }, (_, r) => s[r] ?? 1));
const scaleOf = (i, r) => r >= 0 && r < 100 && Number.isInteger(r) ? scaleTable[i][r] : data.scales[i][r] ?? 1;
const maxWeightCache = new Map();
const maxWeight = (height, type) => {
  const key = height * 64 + type;
  let m = maxWeightCache.get(key);
  if (m === undefined) maxWeightCache.set(key, m = Math.max(...data.weights[height][type]));
  return m;
};

export function resolveLinks(manual, height) {
  const ratings = manual.slice();
  const t = flatLinks(height), n = t.length;
  let changed;
  do {
    changed = false;
    for (let k = 0; k < n; k += 3) {
      const minimum = ratings[t[k]] - t[k + 2];
      if (ratings[t[k + 1]] < minimum) {
        ratings[t[k + 1]] = minimum;
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
  const n = ratings.length, scales = new Float64Array(n);
  for (let i = 0; i < n; i++) scales[i] = scaleOf(i, ratings[i]);
  let best = -Infinity, playerType = 0;
  const all = data.weights[height];
  for (let type = 0; type < all.length; type++) {
    const weights = all[type];
    let numerator = 0, denominator = 0;
    for (let i = 0; i < n; i++) {
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

// Incremental Overall for the optimizers' inner loops: per-archetype weighted sums [numerator, denominator] × types.
// Moving a few ratings updates them in O(types × changed) instead of recomputing all 21. Rounding can drift by ~1e-12,
// so final checks still use overall().
export function sumsOf(ratings, height) {
  const all = data.weights[height], out = new Float64Array(2 * all.length);
  for (let t = 0; t < all.length; t++) {
    const w = all[t];
    let num = 0, den = 0;
    for (let i = 0; i < ratings.length; i++) { const x = w[i] * scaleOf(i, ratings[i]); num += x * ratings[i]; den += x; }
    out[2 * t] = num; out[2 * t + 1] = den;
  }
  return out;
}
export function sumsWith(sums, from, to, height) {
  const all = data.weights[height], out = sums.slice();
  for (let i = 0; i < to.length; i++) {
    const a = from[i], b = to[i];
    if (a === b) continue;
    const sa = scaleOf(i, a), sb = scaleOf(i, b);
    for (let t = 0; t < all.length; t++) {
      const w = all[t][i];
      out[2 * t] += w * sb * b - w * sa * a;
      out[2 * t + 1] += w * sb - w * sa;
    }
  }
  return out;
}
// The planners' innermost loop: the Overall of every archetype after changing a few ratings, without building the new sums.
// Exactly sumsWith + scoreOfSums + scoreAsOfSums (same terms, added in the same order, so the same floating-point result)
// for changes at ascending indices at[0..n) to values to[0..n) (from = the ratings `sums` was built on).
// Writes { score, playerType, as: the score of `type` } into out.
export function scoresAfter(sums, from, at, to, n, height, type, out) {
  const all = data.weights[height], T = all.length;
  const [[low, high], [start, end]] = data.lerp[height - 64];
  let best = -Infinity, playerType = 0, as = 0;
  for (let t = 0; t < T; t++) {
    const w = all[t];
    let num = sums[2 * t], den = sums[2 * t + 1];
    for (let k = 0; k < n; k++) {
      const i = at[k], a = from[i], b = to[k], wi = w[i];
      const sa = scaleOf(i, a), sb = scaleOf(i, b);
      num += wi * sb * b - wi * sa * a;
      den += wi * sb - wi * sa;
    }
    const score = start + (num / den - low) * (end - start) / (high - low);
    if (score > best + 1e-10) { best = score; playerType = t; }
    if (t === type) as = score;
  }
  out.score = best; out.playerType = playerType; out.as = as;
  return out;
}
export function scoreOfSums(sums, height) {
  const [[low, high], [start, end]] = data.lerp[height - 64];
  let best = -Infinity, playerType = 0;
  for (let t = 0; 2 * t < sums.length; t++) {
    const score = start + (sums[2 * t] / sums[2 * t + 1] - low) * (end - start) / (high - low);
    if (score > best + 1e-10) { best = score; playerType = t; }
  }
  return { score: best, playerType };
}
export function scoreAsOfSums(sums, height, type) {
  const [[low, high], [start, end]] = data.lerp[height - 64];
  return start + (sums[2 * type] / sums[2 * type + 1] - low) * (end - start) / (high - low);
}

// Score of one archetype (the build's Overall is the best of these; that archetype is its player type).
export function overallAs(ratings, height, type) {
  const [[low, high], [start, end]] = data.lerp[height - 64];
  const weights = data.weights[height][type];
  let numerator = 0, denominator = 0;
  for (let i = 0; i < ratings.length; i++) {
    const weight = weights[i] * scaleOf(i, ratings[i]);
    numerator += weight * ratings[i];
    denominator += weight;
  }
  return start + (numerator / denominator - low) * (end - start) / (high - low);
}
export const playerTypeCount = height => data.weights[height].length;
export const linksFor = height => data.links[height] ?? [];
export const typeWeights = (height, type) => data.weights[height][type];

export function assess(ratings, height, caps) {
  const { score, playerType } = overall(ratings, height);
  const limit = 99;
  const withinCaps = ratings.every((rating, i) => rating <= caps[i]);
  return { score, playerType, limit, withinCaps, fits: withinCaps && score <= limit + 1e-8 };
}

export function ladder(index, rating, cap, height, playerType) {
  const top = maxWeight(height, playerType);
  const proportion = (top - data.weights[height][playerType][index]) / top;
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



