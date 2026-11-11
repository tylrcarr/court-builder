import { attributes, badges } from './engine.js';
import { badgeSummary, search } from './solver.js';
import { maximizeBadges } from './tune.js';

self.onmessage = ({ data }) => {
  const { id, options } = data;
  try {
    const badgeGoals = (options.badgeGoals ?? []).map(g => ({ badge: badges.find(b => b.badge === g.badge), tier: g.tier }));
    const result = search({ ...options, badgeGoals,
      onProgress: progress => self.postMessage({ id, progress }) });
    if (options.polish) {
      // Trade Overall budget for extra badge tiers on each result, never losing a badge it already has.
      result.results = result.results.map((r, k) => {
        self.postMessage({ id, progress: { done: k + 1, total: result.results.length, label: 'Polishing badges' } });
        const build = { body: r.body, base: r.manual, breakers: r.breakers };
        const { build: polished, gained } = maximizeBadges(build, attributes.map(() => false), { rounds: 25 });
        return gained.length ? { ...r, manual: polished.base, base: polished.base, polished: gained.length,
          badges: badgeSummary(r.final, r.body.height) } : r;
      });
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
