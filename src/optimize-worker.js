import { huntBuild, huntScreen } from './hunt.js';
import { blockers, bodiesFor, minBreakers, optimizeAcross, optimizeBodyFull, polishPlan, screenBodies, tradeOffs } from './breakpoints.js';
import { setMipSolver } from './mip.js';
import loadHighs from 'highs';
import highsWasm from 'highs/runtime?url';

// The exact planner (HiGHS in WebAssembly) loads in the background; until it's ready (or if it can't load) the
// optimizer runs without it.
const solverReady = loadHighs({ locateFile: () => highsWasm }).then(setMipSolver).catch(() => null);

// Jobs: 'screen' (which bodies are worth optimizing), 'body' (one body, all archetypes worth trying), 'blockers'
// (why nothing fits), 'polish' (re-plan a leading build: same tiers kept, or exact plan around it), plus the
// single-thread 'across' and 'tradeoffs' used by the Builder.
self.onmessage = async ({ data }) => {
  const { kind, options } = data;
  if (kind === 'polish' || kind === 'warm') await solverReady;
  if (kind === 'warm') return self.postMessage({ result: true });
  const onProgress = progress => self.postMessage({ progress });
  try {
    if (kind === 'screen') {
      const bodies = bodiesFor(options.positions, options.heights, { frames: 5, around: options.around, opts: options.opts });
      const r = screenBodies(bodies, { ...options.opts, pinFirst: !!options.around }, { onProgress, keep: options.keep ?? 12 });
      self.postMessage({ result: r });
    } else if (kind === 'body') {
      self.postMessage({ result: optimizeBodyFull(options.body, options.opts, { pinned: options.pinned }) });
    } else if (kind === 'polish') {
      self.postMessage({ result: polishPlan(options.plan, options.opts, options.type) });
    } else if (kind === 'minBreakers') {
      self.postMessage({ result: minBreakers(options.positions, options.heights, options.opts) });
    } else if (kind === 'blockers') {
      self.postMessage({ result: blockers(options.positions, options.heights, options.opts, { onProgress }) });
    } else if (kind === 'across') {
      const bodies = bodiesFor(options.positions, options.heights, { frames: options.thorough ? 5 : 3, around: options.around, opts: options.opts });
      const result = optimizeAcross(bodies, { ...options.opts, pinFirst: !!options.around }, { onProgress, keep: options.keep ?? 10 });
      if (!result.results.length) result.blockers = blockers(options.positions, options.heights, options.opts, { onProgress });
      self.postMessage({ result });
    } else if (kind === 'huntScreen') {
      self.postMessage({ result: huntScreen(options.positions, options.heights, options.picks, options.want, options.breakers, { minStep: options.minStep, need: options.need }) });
    } else if (kind === 'huntBuild') {
      self.postMessage({ result: huntBuild(options.candidate, options.opts) });
    } else if (kind === 'tradeoffs') {
      self.postMessage({ result: tradeOffs(options.plan, options.opts, { onProgress, focus: options.focus ?? null }) });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
