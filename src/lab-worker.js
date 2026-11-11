import { badges } from './engine.js';
import { search } from './solver.js';

self.onmessage = ({ data }) => {
  const { id, options } = data;
  try {
    const badgeGoals = (options.badgeGoals ?? []).map(g => ({ badge: badges.find(b => b.badge === g.badge), tier: g.tier }));
    const result = search({ ...options, badgeGoals,
      onProgress: progress => self.postMessage({ id, progress }) });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
