// Badge equipping: each discipline's tokens (earned from its ratings) pay for the badges equipped in it, at the tier you
// choose (each tier has its own price), plus one pool of bonus tokens (Season rewards and the like) that can cover any
// discipline's shortfall. Fused badges cost nothing.
import { tiers } from './engine.js';
import { groups } from './derive.js';
import { metaOf, metaTierWorth } from './meta.js';

// Tokens over budget, total: what the bonus pool has to cover.
export const shortfall = (spent, earned) => groups.reduce((s, g) => s + Math.max(0, (spent[g] ?? 0) - (earned[g] ?? 0)), 0);

// The meta's best setup: which tier (or none) to equip for each unlocked badge, maximizing meta worth within the token
// budgets. Exact: a multiple-choice knapsack per discipline, then the bonus pool split across disciplines.
// rows: [{ key, discipline, maxTier, goal, free }] · price(key, tier) → tokens · returns { [key]: tier | 'off' }.
export function metaSetup(rows, earned, bonus, price, position) {
  const worth = (r, t) => {
    const rank = tiers.indexOf(t) + 1;
    // Everything you equip is worth a little (a badge on is better than off), meta badges a lot more.
    return 0.05 * rank + Math.max(0, metaOf(r.goal, position)) * metaTierWorth(r.goal, rank);
  };
  const plan = {};
  const per = groups.map(g => {
    const list = rows.filter(r => r.discipline === g);
    const cap = (earned[g] ?? 0) + bonus;
    // best[c] = [value, choices] using at most c tokens.
    let best = Array.from({ length: cap + 1 }, () => [0, []]);
    for (const r of list) {
      const options = tiers.slice(0, tiers.indexOf(r.maxTier) + 1).map(t => ({ t, cost: r.free ? 0 : price(r.key, t), v: worth(r, t) }));
      const next = best.map(x => [...x]);
      for (let c = 0; c <= cap; c++) for (const o of options) {
        if (o.cost > c) continue;
        const v = best[c - o.cost][0] + o.v;
        if (v > next[c][0] + 1e-9) next[c] = [v, [...best[c - o.cost][1], [r.key, o.t]]];
      }
      best = next;
    }
    return { g, best, earned: earned[g] ?? 0 };
  });
  // Split the bonus: dp over disciplines of value with b bonus tokens used.
  let dp = Array.from({ length: bonus + 1 }, (_, b) => b === 0 ? [0, []] : [-Infinity, []]);
  for (const p of per) {
    const next = Array.from({ length: bonus + 1 }, () => [-Infinity, []]);
    for (let b = 0; b <= bonus; b++) {
      if (dp[b][0] === -Infinity) continue;
      for (let extra = 0; b + extra <= bonus; extra++) {
        const [v, choice] = p.best[Math.min(p.best.length - 1, p.earned + extra)];
        if (dp[b][0] + v > next[b + extra][0] + 1e-9) next[b + extra] = [dp[b][0] + v, [...dp[b][1], choice]];
      }
    }
    dp = next;
  }
  const top = dp.reduce((a, x) => x[0] > a[0] ? x : a, [-Infinity, []]);
  for (const r of rows) plan[r.key] = 'off';
  for (const choice of top[1]) for (const [k, t] of choice) plan[k] = t;
  return plan;
}
