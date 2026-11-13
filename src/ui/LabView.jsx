import React, { useEffect, useMemo, useRef, useState } from 'react';
import { attributes, badgeTier, capsFor, feet, name, playerTypeCount, positions, tiers, typeWeights } from '../engine.js';
import { CONTINUOUS_WEIGHTS, IMPORTANCE, MAX_CAP_BREAKERS, SPECIALIZATIONS, archetypeCandidates, archetypeScore, byName, nudgeBodies, pickArchetype, capOf, rankPlans, defaultPrefs, goals, heldTiers, metaScore, nearOf, nearOfDerived, usesMeta, valueOf } from '../breakpoints.js';
import { META_CAPS, metaOf } from '../meta.js';
import { BROAD_VARIANTS, VARIANTS } from '../variants.js';
import { isAnimation } from '../animations.js';
import { animationTypes, customJumper, findAnimation, groupsOf, outOfRange, searchAnimations, sizesText, wantKey, wantMinimums } from '../anim-wants.js';
import { AnimationProfiles } from './AnimProfiles.jsx';
import { requirementLabel } from '../unlocks.js';
import { MODES, ROLES, ROLE_GROUPS, applyRole, withMode } from '../roles.js';
import { derive, groups, tierShort } from '../derive.js';
import { BreakerChartDetails } from './BreakerChart.jsx';
import { RatingReasons } from './RatingReasons.jsx';
import { Archetype, BodyLine, HeightRange, MiniRatings, NumberInput, PositionToggles, Select, TierPill, disciplineColour, label,
  requirementText } from './common.jsx';

export const defaultLab = () => ({
  positions: [], heights: [69, 88], mode: 'both',
  breakers: { general: 8, future: 0, special: { category: 'shooting' } },
  mustHave: {}, from: null, keepBadges: true, thorough: false,
});

const goalLabel = g => g.label ?? label(g.name);
// Meta worth in words (best of guard / wing / big): 0 none, under 1 low, under 2 normal, under 3 high, 3+ top.
const metaWord = m => m <= 0 ? 'none' : m < 1 ? 'low' : m < 2 ? 'normal' : m < 3 ? 'high' : 'top';
const badgeGoals = goals.filter(g => !isAnimation(g));
const animationGoals = goals.filter(isAnimation);
const categories = [...new Set(badgeGoals.map(b => b.discipline))];

// Runs optimizer jobs in a worker. Returns [state, run, cancel].
export function useOptimize() {
  const worker = useRef(null);
  const [state, setState] = useState({ running: false });
  const cancel = () => { worker.current?.terminate(); worker.current = null; setState(s => ({ ...s, running: false })); };
  useEffect(() => cancel, []);
  const run = (kind, options) => {
    cancel();
    const w = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
    worker.current = w;
    const started = performance.now();
    setState({ running: true, kind });
    w.onmessage = ({ data }) => {
      if (data.progress) return setState(s => ({ ...s, progress: data.progress }));
      setState({ running: false, kind, error: data.error, result: data.result, ms: Math.round(performance.now() - started) });
      w.terminate(); worker.current = null;
    };
    w.onerror = () => setState({ running: false, error: 'The optimizer could not finish.' });
    w.postMessage({ kind, options });
  };
  return [state, run, cancel];
}

// Runs many optimizer jobs across a pool of workers (one per CPU core: the page itself only waits on them). runJobs resolves
// with results in job order; cancel() stops everything in flight.
// Workers are kept between the steps of a search (each new worker reloads the optimizer and HiGHS and starts cold, about
// a second per body), then shut down after IDLE_MS without work, when the view unmounts, or when the page is hidden for
// good. So nothing keeps running in the background once a search is done. Identical jobs within one run are answered
// from memory.
const IDLE_MS = 45000;
const workerUrl = new URL('../optimize-worker.js', import.meta.url);
export function usePool({ warm = false } = {}) {
  const idle = useRef([]), busy = useRef(new Set()), warming = useRef(new Set()), timer = useRef(null), token = useRef(0), memo = useRef(new Map());
  const size = Math.max(2, navigator.hardwareConcurrency || 4);
  const killIdle = () => { idle.current.forEach(w => w.terminate()); idle.current = []; };
  const armIdle = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { if (!busy.current.size) killIdle(); }, IDLE_MS); };
  const take = () => idle.current.pop() ?? new Worker(workerUrl, { type: 'module' });
  const release = w => { busy.current.delete(w); w.onmessage = null; w.onerror = null; idle.current.push(w); armIdle(); };
  // Stop what's running: busy workers are terminated (they may be mid-job); idle ones stay warm.
  const cancel = () => { busy.current.forEach(w => w.terminate()); busy.current.clear(); token.current++; memo.current.clear(); armIdle(); };
  const shutdown = () => { cancel(); killIdle(); warming.current.forEach(w => w.terminate()); warming.current.clear(); clearTimeout(timer.current); };
  useEffect(() => {
    const gone = () => shutdown();
    window.addEventListener('pagehide', gone);
    // Pre-warm: load the optimizer and HiGHS in a few workers before the first click.
    if (warm) Array.from({ length: Math.min(size, 4) }, () => {
      const w = new Worker(workerUrl, { type: 'module' }); warming.current.add(w);
      w.onmessage = () => { warming.current.delete(w); idle.current.push(w); w.onmessage = null; armIdle(); };
      w.onerror = () => { warming.current.delete(w); w.terminate(); };
      w.postMessage({ kind: 'warm' });
    });
    return () => { window.removeEventListener('pagehide', gone); shutdown(); };
  }, []);
  const runJobs = (jobs, onDone) => new Promise(resolve => {
    const results = new Array(jobs.length), mine = token.current;
    let next = 0, done = 0;
    if (!jobs.length) return resolve(results);
    const finish = (k, value) => { results[k] = value; done++; onDone?.(done, jobs.length); if (done === jobs.length) resolve(results); };
    const keyOf = job => job.kind === 'body' || job.kind === 'polish' ? JSON.stringify(job) : null;
    const feed = w => {
      if (mine !== token.current) return;
      while (next < jobs.length) {
        const k = next++, key = keyOf(jobs[k]);
        if (key && memo.current.has(key)) { finish(k, memo.current.get(key)); continue; }
        w.onmessage = ({ data }) => {
          if (data.progress) return;
          const value = data.error ? { error: data.error } : data.result;
          if (key && !data.error) memo.current.set(key, value);
          finish(k, value); feed(w);
        };
        w.onerror = () => { busy.current.delete(w); w.terminate(); finish(k, { error: 'Worker failed' }); if (next < jobs.length && mine === token.current) { const n = take(); busy.current.add(n); feed(n); } };
        w.postMessage(jobs[k]);
        return;
      }
      release(w);
    };
    for (let i = 0; i < Math.min(size, jobs.length); i++) { const w = take(); busy.current.add(w); feed(w); }
  });
  return { runJobs, cancel, token, size };
}

// Lab prefs + config → optimizer options. Starting from a build adds its valued badge tiers as must-haves.
export function optimizerOptions(rawPrefs, cfg) {
  const prefs = withMode(rawPrefs, cfg.mode ?? 'both');
  // Wanted animations (jumpers, dribble styles…) are hard minimums on the ratings they need.
  const anim = wantMinimums(rawPrefs.wantAnims, prefs.minimums);
  const minimums = attributes.map(a => Math.max(25, prefs.minimums?.[a.name] ?? 25, anim[a.name] ?? 25));
  const maximums = attributes.map(a => prefs.maximums?.[a.name] ?? 99);
  const mustHave = { ...cfg.mustHave };
  if (cfg.from && cfg.keepBadges) {
    const d = derive(cfg.from);
    for (const [k, r] of heldTiers(d.final, cfg.from.body.height, prefs))
      if (tiers.indexOf(mustHave[k]) < r - 1) mustHave[k] = tiers[r - 1];
  }
  return { values: prefs.values, caps: prefs.caps, continuous: prefs.continuous, notFeel: prefs.notFeel, continuousWeights: prefs.continuousWeights ?? {},
    minimums, maximums, breakers: cfg.breakers, mustHave, mode: cfg.mode ?? 'both', metaRate: rawPrefs.metaRate ?? 1, arms: rawPrefs.arms ?? null };
}

// Search results survive reloads and tab switches (a comprehensive search takes minutes): the last run is kept, and
// each saved search keeps the results it had when saved. Stored apart from the searches list so a full storage can
// only lose results, never the searches themselves.
const RESULTS_KEY = 'court-builder.lab-results.v1', resultsKey = id => `court-builder.lab-results.${id}.v1`;
const readResults = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeResults = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const fromSaved = saved => saved?.result ? { running: false, result: saved.result, ms: saved.ms, restored: saved } : { running: false };

export default function LabView({ build, prefs, setPrefs, cfg, setCfg, searches, setSearches, onOpen, onCompare, onSave, notify, onStatus }) {
  const pool = usePool({ warm: true });
  const [state, setState] = useState(() => fromSaved(readResults(RESULTS_KEY)));
  // The search keeps running while you look at other tabs: the tab shows its clock.
  useEffect(() => onStatus?.(state.running ? { running: true, started: state.started } : null), [state.running]);
  const cancel = () => { pool.cancel(); setState(s => ({ ...s, running: false })); };
  // A finished run is saved as "last results" (restored ones already are).
  useEffect(() => {
    if (state.running || !state.result || state.restored) return;
    writeResults(RESULTS_KEY, { savedAt: Date.now(), thorough: !!cfg.thorough, ms: state.ms, result: state.result });
  }, [state.result, state.running]);
  const [searchName, setSearchName] = useState('');
  const [overwrite, setOverwrite] = useState(null); // name of an existing search waiting for "Overwrite?"
  const [sortBy, setSortBy] = useState('meta');
  const set = patch => setCfg(c => ({ ...c, ...(typeof patch === 'function' ? patch(c) : patch) }));
  const source = cfg.from ?? build;
  const positionsUsed = cfg.positions.length ? cfg.positions : Object.keys(positions);
  const fromD = useMemo(() => cfg.from ? derive(cfg.from) : null, [cfg.from]);
  const keptCount = useMemo(() => fromD ? heldTiers(fromD.final, cfg.from.body.height, prefs).size : 0, [fromD, prefs]);
  const role = ROLES.find(r => r.id === prefs.role);

  // "Find exact" from the Builder asks for a run as soon as the Lab opens.
  useEffect(() => { if (cfg.runNow) { set({ runNow: undefined }); start(); } }, [cfg.runNow]);

  // Screen bodies → optimize each kept body (natural + promising archetypes) in parallel → variations of the leaders.
  async function start() {
    pool.cancel();
    const mine = pool.token.current, started = performance.now();
    const live = () => mine === pool.token.current;
    // Each stage owns a slice of the overall bar ([from, to] in %), filled as its jobs finish.
    const progress = (label, [from, to]) => (done, total) => live() && setState(s => ({ ...s,
      progress: { label, done, total, pct: from + (to - from) * (total ? done / total : 0) } }));
    const stage = (label, pct) => live() && setState(s => ({ ...s, progress: { label, pct } }));
    let opts = optimizerOptions(prefs, cfg);
    const where = { positions: positionsUsed, heights: cfg.heights };
    // Comprehensive: twice the bodies through the full optimizer, and every archetype on each (not just the 3 likeliest).
    const thorough = !!cfg.thorough;
    const screen = o => pool.runJobs([{ kind: 'screen', options: { ...where, around: cfg.from ? cfg.from.body : null, opts: o,
      keep: (thorough ? MAX_BUILDS * 2 : MAX_BUILDS) + 4 } }]); // a few spare: twins (same body at two positions) merge below
    setState({ running: true, started, progress: { label: 'Screening bodies', pct: 1 } });
    let [scr] = await screen(opts);
    if (!live()) return;
    if (scr.error) return setState({ running: false, error: scr.error });
    // Nothing fits with your breakers: find the version with as few extra as it takes (up to a year's worth) and show it.
    let needs = null;
    if (!scr.chosen.length) {
      setState(s => ({ ...s, progress: { label: 'Checking how many Cap Breakers it needs' } }));
      const [total] = await pool.runJobs([{ kind: 'minBreakers', options: { ...where, opts } }]);
      if (!live()) return;
      if (typeof total === 'number') {
        const have = opts.breakers.general + (opts.breakers.future ?? 0);
        opts = { ...opts, breakers: { ...opts.breakers, general: total - (opts.breakers.future ?? 0) } };
        [scr] = await screen(opts);
        if (!live()) return;
        if (scr.chosen?.length) needs = { have, total };
      }
    }
    if (!scr.chosen.length) {
      setState(s => ({ ...s, progress: { label: 'Finding what blocks the search' } }));
      const [bl] = await pool.runJobs([{ kind: 'blockers', options: { ...where, opts } }]);
      if (!live()) return;
      return setState({ running: false, ms: performance.now() - started,
        result: { results: [], screened: 0, bodies: scr.bodies, blockers: Array.isArray(bl) ? bl : [] } });
    }
    // Two passes, both spread over every worker: each body in its natural archetype, then the same body forced into
    // other archetypes (each its own job). An archetype wins on picks + meta (see pickArchetype).
    const natural = await pool.runJobs(scr.chosen.map(c => ({ kind: 'body', options: { body: c.body, pinned: c.pinned,
      opts: { ...opts, archetypes: false } } })), progress(`Optimizing bodies (${pool.size} at a time)`, [6, 40]));
    if (!live()) return;
    stage('Trying other archetypes', 40);
    const alts = natural.flatMap((r, k) => !r || r.error ? [] : (thorough
      ? Array.from({ length: playerTypeCount(r.body.height) }, (_, t) => t).filter(t => t !== r.playerType)
      : archetypeCandidates(r, 3)).map(type => ({ k, type, mustHave: r.seed ? { ...opts.mustHave, [r.seed.name]: r.seed.tier } : opts.mustHave })));
    const forced = await pool.runJobs(alts.map(({ k, type, mustHave }) => ({ kind: 'body', options: { body: natural[k].body,
      // beat: the natural plan's score. A forced plan trailing it by more than the take-back pass can add skips that pass.
      opts: { ...opts, mustHave, forceType: type, archetypes: false, seeds: 0, beat: archetypeScore(natural[k], natural[k].body, opts) } } })),
      progress(`Trying ${thorough ? 'every archetype' : 'other archetypes'} on each body`, [40, 66]));
    if (!live()) return;
    const plans = natural.map((first, k) => {
      if (!first || first.error) return first;
      const mine = forced.filter((x, j) => alts[j].k === k && x && !x.error).map((x, j) => ({ ...x, forcedType: x.playerType }));
      const best = pickArchetype(first, mine, first.body, opts);
      return best === first ? first : { ...best, archetypeTrick: true, naturalValue: first.value, naturalType: first.playerType };
    });
    // Nudge the leaders' frames: a pound or an inch that opens a breakpoint they just miss (see nudgeBodies). Kept only
    // when the nudged build is really better (picks + meta, the same rule as archetypes).
    const leaders = rankPlans(plans.filter(r => r && !r.error), opts).slice(0, thorough ? Infinity : 8);
    // A preset that wants the longest arms (inside bigs) keeps them: no nudging to shorter ones.
    const nudges = leaders.flatMap(r => nudgeBodies(r, thorough ? 5 : 3).map(n => ({ r, ...n })))
      .filter(n => opts.arms !== 'max' || n.body.wingspan >= n.r.body.wingspan);
    if (nudges.length) {
      // The nudged body keeps the leader's archetype as the seed: no full archetype sweep (that's 40–70% of a search for the
      // same results); the polish step below still tries other archetypes on whatever wins.
      const nudged = await pool.runJobs(nudges.map(n => ({ kind: 'body', options: { body: n.body, opts: { ...opts, archetypes: false } } })),
        progress('Nudging weight and wingspan toward breakpoints', [66, 78]));
      if (!live()) return;
      nudged.forEach((x, j) => {
        const n = nudges[j], k = plans.indexOf(n.r), cur = plans[k];
        if (!x || x.error || !cur || archetypeScore(x, n.body, opts) <= archetypeScore(cur, cur.body, opts) + 0.5) return;
        if (n.opens.every(o => x.final[o.i] < o.m)) return; // better, but not for the reason it was tried
        plans[k] = { ...x, nudged: { from: n.r.body, opens: n.opens.filter(o => x.final[o.i] >= o.m) } };
      });
    }
    // Polish the leaders: the greedy pass can stop at a worse arrangement than the best for what it reached (clicking
    // Re-optimize on a result often found a better build). Each leader is re-planned with every worthwhile tier it holds
    // kept, as its own and the likeliest other archetypes, plus an exact plan around it; the best replaces it.
    {
      const ok = plans.filter(r => r && !r.error);
      const top = rankPlans([...ok], opts).slice(0, thorough ? 12 : 6);
      const jobs = top.flatMap(r => {
        const types = thorough ? Array.from({ length: playerTypeCount(r.body.height) }, (_, t) => t) : [r.playerType, ...archetypeCandidates(r, 2)];
        return [null, 'mip', ...new Set(types)].map(type => ({ r, type }));
      });
      const slim = r => ({ body: r.body, base: r.base, manual: r.manual, breakers: r.breakers, final: r.final, playerType: r.playerType });
      const polished = await pool.runJobs(jobs.map(j => ({ kind: 'polish', options: { plan: slim(j.r), opts, type: j.type } })),
        progress('Polishing the leaders', [78, 92]));
      if (!live()) return;
      polished.forEach((x, j) => {
        const { r } = jobs[j], k = plans.indexOf(r), cur = plans[k];
        if (!x || x.error || !cur || archetypeScore(x, x.body, opts) <= archetypeScore(cur, cur.body, opts) + 0.05) return;
        plans[k] = { ...x, nudged: cur.nudged, polished: { from: archetypeScore(r, r.body, opts), exact: !!x.exact },
          ...(x.playerType !== r.playerType ? { archetypeTrick: true, naturalValue: r.value, naturalType: r.playerType } : {}) };
      });
    }
    // Same body dimensions + same ratings at different positions are one build (position only sets the name/meta group).
    const results = [];
    for (const r of rankPlans(plans.filter(r => r && !r.error), opts)) {
      const twin = results.find(x => x.body.height === r.body.height && x.body.weight === r.body.weight && x.body.wingspan === r.body.wingspan
        && x.final.every((v, i) => v === r.final[i]));
      if (twin) twin.alsoPositions = [...(twin.alsoPositions ?? []), r.body.position];
      else results.push(r);
    }
    // Near-identical builds (same height and arms, ratings within a few points) are the same build at another weight:
    // keep the best, note the other weights.
    for (let k = results.length - 1; k > 0; k--) {
      const r = results[k];
      const twin = results.slice(0, k).find(x => x.body.height === r.body.height && x.body.wingspan === r.body.wingspan
        && x.playerType === r.playerType && x.final.reduce((s, v, i) => s + Math.abs(v - r.final[i]), 0) <= 6);
      if (twin) { twin.alsoWeights = [...(twin.alsoWeights ?? []), r.body.weight]; results.splice(k, 1); }
    }
    results.splice(thorough ? MAX_BUILDS * 2 : MAX_BUILDS);
    // Fewer bodies than result slots: fill the rest with other ways to spend the points on the best bodies — each
    // direction (faster, more playmaking…) re-optimized on that body, keeping only options that really differ.
    let options = [];
    const notes = [], armsFailed = new Set();
    const open = MAX_BUILDS - results.length;
    if (open > 0) {
      const leaders = rankPlans([...results], opts).slice(0, Math.min(results.length, 4));
      // An option only re-spends the extra points: the body's own build keeps its feel attributes and Key/Core badges.
      const feelIdx = (opts.continuous ?? []).map(k => attributes.findIndex(a => a.name === k)).filter(i => i >= 0);
      const protect = r => {
        const minimums = opts.minimums.map((m, i) => feelIdx.includes(i) ? Math.max(m, r.final[i]) : m);
        const mustHave = { ...opts.mustHave };
        for (const g of goals) {
          if (valueOf(prefs, g) < 2) continue;
          const t = badgeTier(g, r.final, r.body.height);
          if (t && tiers.indexOf(mustHave[g.name]) < tiers.indexOf(t)) mustHave[g.name] = t;
        }
        return { ...opts, minimums, mustHave };
      };
      const keeps = (o, r) => feelIdx.every(i => o.final[i] >= r.final[i]) && goals.every(g => valueOf(prefs, g) < 2
        || tiers.indexOf(badgeTier(g, o.final, o.body.height)) >= tiers.indexOf(badgeTier(g, r.final, r.body.height)));
      const spread = (o, r) => o.final.reduce((s, v, i) => s + Math.abs(v - r.final[i]), 0);
      // Body-specific directions: another archetype, the weakest ratings, one cheap attribute pushed to elite.
      const extras = r => {
        const list = [];
        const type = archetypeCandidates(r, 1)[0];
        if (type != null) list.push({ id: 'archetype', label: 'Different archetype', blurb: 'Same goals as another player type, so Cap Breakers land differently.',
          job: o => ({ ...o, forceType: type }), keep: x => x.playerType !== r.playerType && spread(x, r) >= 12 });
        const weak = attributes.map((_, i) => i).filter(i => !feelIdx.includes(i) && r.final[i] < 60 && opts.maximums[i] > r.final[i] + 5)
          .sort((i, j) => r.final[i] - r.final[j]).slice(0, 4);
        if (weak.length >= 2) list.push({ id: 'weak', label: 'Shore up weaknesses', blurb: `Raise the lowest ratings: ${weak.map(i => name(attributes[i].name)).join(', ')}.`,
          job: o => ({ ...o, continuous: [...new Set([...(o.continuous ?? []), ...weak.map(i => attributes[i].name)])],
            continuousWeights: { ...o.continuousWeights, ...Object.fromEntries(weak.map(i => [attributes[i].name, 1.5])) } }),
          keep: x => weak.reduce((s, i) => s + x.final[i] - r.final[i], 0) >= 10 });
        // Longer arms: the longest wingspan whose caps still hold what's protected (longer arms cost shooting caps).
        const row = positions[r.body.position].find(x => x.height === r.body.height);
        const floorsHeld = protect(r).minimums;
        let ws = null;
        for (let w = row?.maxWingspan ?? 0; w > r.body.wingspan; w--)
          if (capsFor({ ...r.body, wingspan: w }).every((c, i) => c >= floorsHeld[i])) { ws = w; break; }
        // Nothing longer keeps everything (e.g. 3PT already at its cap): offer +2″ anyway, clipping only the ratings whose
        // caps drop — an explicit body change whose cost the card spells out.
        const forced = !ws && row && row.maxWingspan > r.body.wingspan;
        if (forced) ws = Math.min(row.maxWingspan, r.body.wingspan + 2);
        const armCaps = ws ? capsFor({ ...r.body, wingspan: ws }) : null;
        const lost = forced ? attributes.filter((a, i) => armCaps[i] < floorsHeld[i]).map(a => `${name(a.name)} ${floorsHeld[a.index]}→${armCaps[a.index]}`) : [];
        if (ws) list.push({ id: 'arms', label: 'Longer arms',
          blurb: `Same height and weight at a ${feet(ws)} wingspan (+${ws - r.body.wingspan}″): defense, rebounding and dunk caps go up; shooting caps go down.`
            + (lost.length ? ` Costs ${lost.join(', ')} (cap).` : ws < row.maxWingspan ? ` ${feet(ws + 1)}+ would cost the shooting you have.` : ''),
          body: { ...r.body, wingspan: ws }, job: o => forced ? { ...o, minimums: o.minimums.map((m, i) => Math.min(m, armCaps[i])) } : o,
          keep: x => spread(x, r) >= 6, capped: forced ? armCaps : null });
        const caps = capsFor(r.body), w = typeWeights(r.body.height, r.playerType);
        for (const i of attributes.map((_, i) => i).filter(i => attributes[i].name !== 'free_throw' && caps[i] >= 88 && r.final[i] < 85 && opts.maximums[i] >= 88 && !feelIdx.includes(i))
          .sort((i, j) => w[i] - w[j]).slice(0, 2)) {
          const target = Math.min(caps[i], 90);
          list.push({ id: 'elite-' + attributes[i].name, label: `Elite ${name(attributes[i].name)}`, blurb: `One stat pushed to ${target}: the cheapest one for this build's archetype.`,
            job: o => ({ ...o, minimums: o.minimums.map((m, k) => k === i ? Math.max(m, target) : m) }), keep: x => x.final[i] >= target });
        }
        return list;
      };
      const plansFor = leaders.map(r => ({ r, broad: BROAD_VARIANTS, extra: extras(r) }));
      const out = await pool.runJobs(plansFor.flatMap(({ r, broad, extra }) => [
        ...broad.map(v => ({ body: r.body, o: v.apply(protect(r)) })), ...extra.map(e => ({ body: e.body ?? r.body, o: e.job(protect(r)) }))]
        .map(({ body, o }) => ({ kind: 'body', options: { body, opts: { ...o, archetypes: false, seeds: 0 } } }))),
        progress('Finding other ways to spend the points', [92, 100]));
      if (!live()) return;
      let at = 0;
      const perLeader = plansFor.map(({ r, broad, extra }) => {
        const mine = out.slice(at, at + broad.length + extra.length); at += broad.length + extra.length;
        extra.forEach((e, k) => { const x = mine[broad.length + k];
          if (e.id === 'arms' && x?.error) armsFailed.add(`${feet(r.body.height)} ${r.body.position} (${feet(e.body.wingspan)} arms)`); });
        const fromExtra = extra.map((e, k) => { const x = mine[broad.length + k]; return x && !x.error && e.keep(x) ? { ...x, variant: e } : null; }).filter(Boolean);
        return [...fromExtra, ...pickOptions(r, mine.slice(0, broad.length), BROAD_VARIANTS)].map(o => ({ ...o, r }));
      }).map(list => list.filter(o => o.variant?.capped
        ? keeps({ ...o, final: o.final.map((v, i) => v >= Math.min(o.r.final[i], o.variant.capped[i]) ? Math.max(v, o.r.final[i]) : v) }, o.r)
        : keeps(o, o.r))
        .filter((o, k, all) => ![...results, ...all.slice(0, k)].some(x => sameBody(x.body, o.body) && spread(x, o) < 12))
        .map(({ r, ...o }) => ({ ...o, variantOf: r })));
      // Round-robin across bodies so the extra slots aren't all one body.
      for (let k = 0; options.length < open && perLeader.some(l => l.length > k); k++)
        for (const list of perLeader) if (list[k] && options.length < open) options.push(list[k]);
    }
    if (armsFailed.size) notes.push(`No longer-arms option: your must-have badges don't fit on ${[...armsFailed].join(', ')}. Each inch of wingspan lowers shooting caps by about 2.`);
    setState({ running: false, ms: performance.now() - started, result: { results, options, notes, screened: scr.screened, bodies: scr.bodies, needs } });
  }

  function pickRole(r) {
    const { prefs: p, cfg: c } = applyRole(r);
    setPrefs(p);
    set(old => ({ positions: c.positions, heights: c.heights, mustHave: {},
      breakers: { ...old.breakers, special: { category: c.category } } }));
  }
  function reset() {
    setPrefs(defaultPrefs());
    setCfg(defaultLab());
    notify('Lab reset to defaults.');
  }
  // One search per name: saving under an existing name asks first, then replaces it.
  function saveSearch(confirmed = false) {
    const title = searchName.trim() || `${role?.label ?? 'Custom'} · ${new Date().toLocaleDateString()}`;
    const clash = searches.find(x => x.title.toLowerCase() === title.toLowerCase());
    if (clash && !confirmed) { setOverwrite(title); return; }
    const entry = { id: clash?.id ?? crypto.randomUUID(), title, prefs, cfg: { ...cfg, from: null } };
    // Keep the results on screen with it (if any), so loading it shows them without running again.
    let kept = false;
    if (state.result && !state.running) {
      const saved = state.restored ?? { savedAt: Date.now(), thorough: !!cfg.thorough, ms: state.ms, result: state.result };
      kept = writeResults(resultsKey(entry.id), saved);
      if (kept) entry.hasResults = true;
    } else localStorage.removeItem(resultsKey(entry.id));
    setSearches(list => [entry, ...list.filter(x => x.id !== entry.id)].slice(0, 30));
    setSearchName(''); setOverwrite(null);
    notify((clash ? `Overwrote search “${title}”` : `Saved search “${title}”`)
      + (kept ? ' with its results.' : state.result ? ' (results too big to keep — storage is full).' : '.'));
  }

  return <div className="lab">
    <section className="card">
      <div className="card-head"><div><h2>Build Lab</h2>
        <p className="muted">Badge-first: must-have tiers first, then the badge tiers worth the most per Overall point — every rating
          lands on a breakpoint, expensive high ratings come from Cap Breakers, and leftover budget goes to feel attributes.</p></div>
        <div className="actions"><input type="text" placeholder="Search name (optional)" value={searchName} maxLength={60}
          onChange={e => { setSearchName(e.target.value); setOverwrite(null); }} /><button onClick={() => saveSearch()}>Save search</button>
          <button onClick={reset}>Reset</button></div></div>
      {overwrite && <div className="confirm-bar" role="alertdialog" aria-label="Overwrite search">
        <span>A search named <b>“{overwrite}”</b> already exists. Overwrite it?</span>
        <button className="primary" onClick={() => saveSearch(true)}>Overwrite</button>
        <button onClick={() => setOverwrite(null)}>Cancel</button></div>}

      <div className="role-picker"><span className="eyebrow">Start from a preset</span>
        <div className="role-groups">{ROLE_GROUPS.map(([g, title]) => <div key={g} className="role-group">
          <h4>{title}</h4>
          <div className="role-list">{ROLES.filter(r => r.group === g).map(r => <button key={r.id} className={'role-card' + (prefs.role === r.id ? ' on' : '')}
            aria-pressed={prefs.role === r.id} title={r.blurb} onClick={() => pickRole(r)}>
            <span className="role-icon" aria-hidden>{r.icon}</span>
            <span className="role-text"><b>{r.label}</b><small>{r.positions.join('/')} · {feet(r.heights[0])}–{feet(r.heights[1])}{r.arms === 'max' ? ' · long arms' : ''}</small></span>
          </button>)}</div></div>)}</div>
        {role && <p className="role-blurb"><span aria-hidden>{role.icon}</span> <b>{role.label}:</b> {role.blurb} <span className="muted">Badges not listed are ∅ — adjust below.</span></p>}
      </div>
      {searches.length > 0 && <div className="saved-searches"><span className="muted small">Saved:</span>
        {searches.map(s => <span key={s.id} className="chip">
          <button className="linkish" title={s.hasResults ? 'Loads its settings and the results it was saved with' : undefined} onClick={() => {
            setPrefs(s.prefs); setCfg({ ...defaultLab(), ...s.cfg });
            const saved = s.hasResults ? readResults(resultsKey(s.id)) : null;
            if (saved) { pool.cancel(); setState(fromSaved(saved)); writeResults(RESULTS_KEY, saved); }
            notify(`Loaded “${s.title}”${saved ? ' with its results' : ''}.`);
          }}>{s.title}{s.hasResults ? ' ▤' : ''}</button>
          <button className="linkish" aria-label={`Delete ${s.title}`} onClick={() => { localStorage.removeItem(resultsKey(s.id)); setSearches(l => l.filter(x => x.id !== s.id)); }}>×</button></span>)}</div>}

      {cfg.from && <div className="from-build">
        <div><span className="eyebrow">Starting from</span><b>{fromD.finalName ?? 'Builder build'}</b> <BodyLine body={cfg.from.body} /></div>
        <label className="check"><input type="checkbox" checked={cfg.keepBadges} onChange={e => set({ keepBadges: e.target.checked })} />
          Keep its {keptCount} badge tiers you care about (find similar on other bodies)</label>
        <button className="mini-btn" onClick={() => set({ from: null })}>Clear</button>
      </div>}

      <div className="config-grid">
        <div className="config-block">
          <h3>Mode</h3>
          <div className="toggles" role="group" aria-label="Mode">{MODES.map(([id, text]) => <button key={id}
            className={(cfg.mode ?? 'both') === id ? 'on' : ''} aria-pressed={(cfg.mode ?? 'both') === id} onClick={() => set({ mode: id })}>{text}</button>)}</div>
          <p className="muted small">3v3 courts are smaller: outlet passing (Break Starter) matters less, quickness more.</p>
          <h3>Meta</h3>
          <div className="toggles" role="group" aria-label="Meta strength">{[[0, 'Off'], [0.5, 'Light'], [1, 'Normal'], [2, 'Strong']].map(([v, t]) =>
            <button key={v} className={(prefs.metaRate ?? 1) === v ? 'on' : ''} aria-pressed={(prefs.metaRate ?? 1) === v}
              onClick={() => setPrefs(p => ({ ...p, metaRate: v }))}>{t}</button>)}</div>
          <p className="muted small">How much the meta steers what’s left after your musts, minimums and picks: badges on Auto, plus
            speed and agility. It's the everyday meta (rec, park, MyCareer): balanced builds, no cones (75+ perimeter D on
            guards and wings). Off = only what you asked for.</p>
          <h3>Bodies</h3>
          <PositionToggles value={cfg.positions} onChange={positions => set({ positions })} />
          <p className="muted small">{cfg.positions.length ? '' : 'No position selected = all positions.'}</p>
          <HeightRange value={cfg.heights} onChange={heights => set({ heights })} />
          <h3>Cap Breakers</h3>
          <BreakerPlan value={cfg.breakers} onChange={breakers => set({ breakers })} />
        </div>
        <div className="config-block grow-2">
          <AttributeRules prefs={prefs} setPrefs={setPrefs} />
        </div>
        <div className="config-block full">
          <BadgeImportance prefs={prefs} setPrefs={setPrefs} mustHave={cfg.mustHave}
            setMustHave={fn => set(c => ({ mustHave: fn(c.mustHave) }))} />
          <AnimationWants prefs={prefs} setPrefs={setPrefs} mustHave={cfg.mustHave} heights={cfg.heights}
            setMustHave={fn => set(c => ({ mustHave: fn(c.mustHave) }))} setHeights={heights => set({ heights })} notify={notify} />
        </div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={state.running} onClick={start}>{state.running ? 'Optimizing…' : 'Find builds'}</button>
        <label className="check" title="Twice as many bodies through the full optimizer, and every archetype tried on each one. Slower (a few minutes), but it finds the builds where an unusual archetype makes Cap Breakers pay off.">
          <input type="checkbox" checked={!!cfg.thorough} disabled={state.running} onChange={e => set({ thorough: e.target.checked })} />Comprehensive search</label>
        {cfg.thorough && <p className="warn small thorough-warn">⚠ Comprehensive search is <b>3–15× slower</b> (often 10+ minutes) and keeps every CPU core busy.
          In tests it found the same #1 build as the normal search every time, with only small gains further down the list. Use it when you're
          about to commit to a build, not while you're exploring.</p>}
        {state.running && <button onClick={cancel}>Cancel</button>}
        {state.running && <div className="search-progress">
          <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
            {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''} <Elapsed started={state.started} />
            <b className="pct">{Math.round(state.progress?.pct ?? 0)}%</b></p>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress?.pct ?? 0)}>
            <div className="progress-fill" style={{ width: `${Math.max(1, state.progress?.pct ?? 0)}%` }} /></div></div>}
        {!state.running && state.error && <p className="status-line warn">{state.error}</p>}
        {!state.running && state.restored && <p className="status-line muted small">Saved results from {new Date(state.restored.savedAt).toLocaleString()}
          {state.restored.thorough ? ' (comprehensive)' : ''} — run Find builds to refresh.
          <button className="mini-btn" onClick={() => { localStorage.removeItem(RESULTS_KEY); setState({ running: false }); }}>Clear</button></p>}
        {state.result && <p className="status-line">{state.result.screened} of {state.result.bodies} bodies can meet
          the must-haves and minimums; optimized the {state.result.results.length} with the most room{state.ms ? ` in ${(state.ms / 1000).toFixed(1)} s` : ''}.
          {!state.result.results.length && ' Nothing fits.'}</p>}
        {!state.running && state.result?.needs && <div className="needs-breakers warn small">
          Doesn't fit with your {state.result.needs.have} Cap Breakers. These builds use <b>{state.result.needs.total}</b> — the fewest that
          make it work (a year's max is about {MAX_CAP_BREAKERS}).
          <button className="mini-btn" onClick={() => { set(c => ({ breakers: { ...c.breakers, general: state.result.needs.total - (c.breakers.future ?? 0) } }));
            notify(`Lab set to ${state.result.needs.total} Cap Breakers.`); }}>Use {state.result.needs.total}</button></div>}
        {!state.running && state.result && !state.result.results.length && <Blockers list={state.result.blockers ?? []}
          apply={x => {
            for (const b of x.changes) {
              if (b.kind === 'must') set(c => ({ mustHave: { ...c.mustHave, [b.name]: b.to ?? undefined } }));
              else setPrefs(p => ({ ...p, minimums: { ...p.minimums, [b.name]: undefined } }));
            }
            notify('Changed — run Find builds again.');
          }} />}
      </div>
    </section>
    {state.result?.results?.length > 0 && <>
      <h3 className="section-title">Builds <span className="muted small">the best build for each body. Open one in the Builder for a
        requirements-only template and other ways to spend the same body.</span></h3>
      <div className="sort-bar"><span className="muted small">Sort by</span>
        <div className="toggles" role="group" aria-label="Sort">{[['meta', 'Meta score'], ['picks', 'Your picks']].map(([id, text]) =>
          <button key={id} className={sortBy === id ? 'on' : ''} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>{text}</button>)}</div></div>
      <div className="results">{[...state.result.results].sort((a, b) => sortBy === 'meta'
        ? metaScore(b.final, b.body.height, b.body.position, cfg.mode, nearOf(b)) - metaScore(a.final, a.body.height, a.body.position, cfg.mode, nearOf(a)) || b.value - a.value
        : b.value - a.value).map((r, k) =>
        <PlanCard key={k} rank={k + 1} plan={r} prefs={prefs} mode={cfg.mode} current={!!cfg.from && sameBody(r.body, source.body)}
          onOpen={onOpen} onCompare={onCompare} onSave={onSave} />)}</div>
      {state.result.options?.length > 0 && <>
        <h3 className="section-title">Other ways to spend it <span className="muted small">only {state.result.results.length} bod{state.result.results.length === 1
          ? 'y fits' : 'ies fit'}, so here are different allocations of the extra points on the best ones, compared with that body's build above.</span></h3>
        {state.result.notes?.map(n => <p key={n} className="muted small">{n}</p>)}
        <div className="results">{state.result.options.map((r, k) => <PlanCard key={k} plan={r} prefs={prefs} mode={cfg.mode}
          variant={r.variant} compareTo={r.variantOf} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />)}</div>
      </>}
    </>}
  </div>;
}

// Options for one body (used by the Builder's recommender): Meta plus each direction, keeping only the ones that
// noticeably improve something real (their own direction, and more than a free-throw bump).
export const MAX_BUILDS = 12;

export function pickOptions(meta, out, list = VARIANTS) {
  return list.map((v, k) => {
    const r = out[k];
    if (!r || r.error) return null;
    if (r.final.reduce((s, x, i) => s + Math.abs(x - meta.final[i]), 0) < 12) return null;
    if (v.id === 'most-badges') {
      const tiersOf = x => derive({ body: x.body, base: x.manual, breakers: x.breakers, category: x.category }).badgePoints;
      return tiersOf(r) >= tiersOf(meta) + 2 ? { ...r, variant: v } : null;
    }
    const gains = aspectsOf(r, meta, v).filter(d => d.good && d.text !== 'Better free throws');
    if (!gains.length || gains.reduce((s, d) => s + d.x, 0) < 8) return null;
    if (v.aspects && !gains.some(d => v.aspects.includes(d.text))) return null;
    return { ...r, variant: v };
  }).filter(Boolean);
}
export const META_OPTION = { id: 'meta', label: 'Meta', blurb: 'Your picks first, then meta badges and mobility for what’s left.' };

// Requirements only: musts, minimums and the specialization at their cheapest, with what's left to spend.
export function TemplateCard({ plan: p, prefs, mustHave, onOpen, openLabel = 'Open in Builder' }) {
  const t = p.template;
  const build = { body: p.body, base: t.manual, breakers: t.breakers, budget: p.budget, category: p.category, specialCount: p.specialCount };
  const d = useMemo(() => derive(build), [p]);
  const [chartOpen, setChartOpen] = useState(false), [focus, setFocus] = useState(null);
  const left = 99 - t.ovr;
  const musts = Object.entries(mustHave ?? {}).filter(([, x]) => x);
  return <article className="result plan is-template">
    <div className="variant-head"><b>Requirements only</b> <span className="muted small">{t.needsBreakers
      ? 'Your musts, minimums and specialization don’t fit under 99 without Cap Breakers, so this one uses them.'
      : 'Just your musts, minimums and the specialization from base ratings, no Cap Breakers — what every option below starts from.'}</span></div>
    <div className="template-left"><b>{left.toFixed(1)}</b> Overall left to spend <span className="muted small">(uses {t.ovr.toFixed(1)} of 99)</span></div>
    <MiniRatings final={d.final} caps={d.caps} breakers={d.applied} base={d.ratings}
      onPick={i => { setFocus(i); setChartOpen(true); }} picked={chartOpen ? focus : null} />
    {musts.length > 0 && <div className="plan-badges"><h4>Musts</h4><div className="chips">{musts.map(([k, tier]) =>
      <span key={k} className="chip">{byName[k].tiers.length > 1 && <TierPill tier={tier} small />} {goalLabel(byName[k])}</span>)}</div></div>}
    <BreakerChartDetails d={d} open={chartOpen} onToggle={setChartOpen} focus={focus} />
    <footer><button onClick={() => onOpen({ ...build, manual: t.manual })}
      title="Below 99 Overall: spend the rest yourself in the Builder">{openLabel}</button></footer>
  </article>;
}

// Suggestions when nothing fits: the single change that opens up the most bodies.
function Blockers({ list, apply }) {
  if (!list.length) return <p className="muted small">No single change fixes it — try a wider height range or more positions.</p>;
  const what = b => b.kind === 'must'
    ? (b.to ? <>Lower <b>{goalLabel(byName[b.name])}</b> must to {label(b.to)}</> : <>Drop the <b>{goalLabel(byName[b.name])}</b> must</>)
    : <>Remove the <b>{name(b.name)}</b> minimum ({b.from})</>;
  return <div className="blockers"><h4>What’s blocking it</h4>
    <ul className="offers">{list.map((x, k) => <li key={k}><span>{x.changes.map((b, j) => <React.Fragment key={j}>{j > 0 && ' + '}{what(b)}</React.Fragment>)}</span>
      <small>{x.count} bod{x.count === 1 ? 'y' : 'ies'} could work</small>
      <button className="mini-btn" onClick={() => apply(x)}>Apply</button></li>)}</ul></div>;
}

// [better, worse, attributes, points of change that count]
const ASPECTS = [
  ['Faster', 'Slower', ['speed', 'agility'], 5],
  ['Better handle', 'Worse handle', ['ball_handle', 'speed_with_ball'], 5],
  ['Better passing', 'Worse passing', ['pass_accuracy'], 4],
  ['Better shooting', 'Worse shooting', ['three_point', 'mid_range'], 5],
  ['Better free throws', 'Worse free throws', ['free_throw'], 6],
  ['Better dunking', 'Worse dunking', ['driving_dunk'], 4],
  ['Better layups', 'Worse layups', ['driving_layup', 'close_shot'], 6],
  ['Better standing dunk', 'Worse standing dunk', ['standing_dunk'], 6],
  ['Better post game', 'Worse post game', ['post_control'], 6],
  ['Better perimeter D', 'Worse perimeter D', ['perimeter_defense', 'steal'], 5],
  ['Better rim protection', 'Worse rim protection', ['interior_defense', 'block'], 5],
  ['Better rebounding', 'Worse rebounding', ['offensive_rebound', 'defensive_rebound'], 5],
  ['More athletic', 'Less athletic', ['vertical', 'strength'], 5],
];
// What a plan changes against another, in plain words: each aspect sums its attributes' change. The variation's own
// direction (variant.aspects) leads, then gains, then costs.
function aspectsOf(p, ref, variant) {
  const at = n => { const i = attributes.findIndex(a => a.name === n); return p.final[i] - ref.final[i]; };
  const out = [];
  for (const [better, worse, names, step] of ASPECTS) {
    const x = names.reduce((s, n) => s + at(n), 0);
    if (x >= step) out.push({ text: better, good: true, x });
    else if (x <= -step) out.push({ text: worse, good: false, x });
  }
  const own = d => !!variant?.aspects?.includes(d.text);
  return out.sort((a, b) => own(b) - own(a) || b.good - a.good || Math.abs(b.x) - Math.abs(a.x));
}
const sameBody = (a, b) => a.position === b.position && a.height === b.height && a.weight === b.weight && a.wingspan === b.wingspan;

export function BreakerPlan({ value, onChange }) {
  const category = value.special?.category ?? '';
  const spec = SPECIALIZATIONS[category];
  return <>
    <div className="breaker-settings">
      <label className="field compact"><span>Have now</span><NumberInput title="General Cap Breakers now" value={value.general} min={0} max={60}
        onChange={v => onChange({ ...value, general: v })} /></label>
      <label className="field compact"><span>Expect later</span><NumberInput title="Future Cap Breakers" value={value.future ?? 0} min={0} max={60}
        onChange={v => onChange({ ...value, future: v })} /></label>
      <Select compact title="Specialization (+2)" value={category}
        options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => onChange({ ...value, special: { category: v } })} />
    </div>
    {category && <p className="muted small">{spec
      ? `Needs ${Object.entries(spec.minimums).map(([k, v]) => `${name(k)} ${v}`).join(' and ')} base — kept automatically.`
      : 'Unlock requirements for this specialization aren’t in the data yet.'}</p>}
    {(value.future ?? 0) > 0 && <p className="muted small">Designed for {value.general + value.future} breakers; the breaker order shows
      which {value.general} to apply first.</p>}
  </>;
}

// Feel weights and hard minimums in one table.
function AttributeRules({ prefs, setPrefs }) {
  const cw = prefs.continuousWeights ?? {}, mins = prefs.minimums ?? {}, maxs = prefs.maximums ?? {};
  const rows = attributes.filter(a => prefs.continuous.includes(a.name) || (mins[a.name] ?? 25) > 25 || (maxs[a.name] ?? 99) < 99);
  const setP = fn => setPrefs(p => ({ ...p, ...fn(p) }));
  const setWeight = (key, w) => setP(p => ({
    continuous: w ? [...new Set([...p.continuous, key])] : p.continuous.filter(k => k !== key),
    continuousWeights: { ...p.continuousWeights, [key]: w || undefined } }));
  const remove = key => setP(p => ({ continuous: p.continuous.filter(k => k !== key), minimums: { ...p.minimums, [key]: undefined },
    maximums: { ...p.maximums, [key]: undefined } }));
  return <>
    <h3>Attributes</h3>
    <p className="muted small"><b>Feel</b> = worth raising for its own sake (10 points at Normal ≈ one badge tier). <b>Min</b> = hard floor
      (bodies that can’t reach it are skipped). <b>Max</b> = never pay past this, e.g. driving layup when you dunk everything.</p>
    <div className="rules-table">
      <div className="rules-row head"><span>Attribute</span><span>Feel</span><span>Min</span><span>Max</span><span /></div>
      {rows.map(a => <div key={a.name} className="rules-row">
        <span><i style={{ background: disciplineColour(a.discipline) }} />{name(a.name)}</span>
        <select aria-label={`${name(a.name)} feel weight`} value={prefs.continuous.includes(a.name) ? cw[a.name] ?? 1 : 0}
          onChange={e => setWeight(a.name, Number(e.target.value))}>
          <option value={0}>—</option>{CONTINUOUS_WEIGHTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        <NumberInput title={`${name(a.name)} minimum`} className={(mins[a.name] ?? 25) > 25 ? 'set' : ''} value={mins[a.name] ?? 25}
          onChange={v => setP(p => ({ minimums: { ...p.minimums, [a.name]: v } }))} />
        <NumberInput title={`${name(a.name)} maximum`} className={(maxs[a.name] ?? 99) < 99 ? 'set' : ''} value={maxs[a.name] ?? 99}
          onChange={v => setP(p => ({ maximums: { ...p.maximums, [a.name]: v } }))} />
        <button className="mini-btn" aria-label={`Remove ${name(a.name)}`} onClick={() => remove(a.name)}>×</button>
      </div>)}
    </div>
    <select aria-label="Add attribute rule" value="" onChange={e => e.target.value && setWeight(e.target.value, 1)}>
      <option value="">+ Add attribute…</option>
      {attributes.filter(a => !rows.includes(a)).map(a => <option key={a.name} value={a.name}>{name(a.name)}</option>)}
    </select>
  </>;
}

function BadgeImportance({ prefs, setPrefs, mustHave, setMustHave }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [onlyValued, setOnlyValued] = useState(false);
  const shown = badgeGoals.filter(b => (!category || b.discipline === category) && (!onlyValued || valueOf(prefs, b) > 0 || !!mustHave[b.name]) &&
    (!query || goalLabel(b).toLowerCase().includes(query.toLowerCase())));
  const must = Object.values(mustHave).filter(Boolean).length;
  const picked = b => !!mustHave[b.name] || valueOf(prefs, b) > 0;
  const sections = [['Your picks', shown.filter(picked)],
    ...categories.map(c => [name(c), shown.filter(b => b.discipline === c && !picked(b))])].filter(([, list]) => list.length);
  const row = b => <GoalRow key={b.badge} goal={b} prefs={prefs} setPrefs={setPrefs} mustHave={mustHave} setMustHave={setMustHave} />;
  return <>
    <h3>Badges</h3>
    <p className="muted small"><b>Must</b> = every result has at least that tier (bodies that can’t are skipped). The dropdown is how much a badge
      is worth paying for on top of that (Don’t care → Core), and <b>Up to</b> caps the tier worth buying (Break Starter gold saves 8 pass accuracy
      over HoF). Badges you pick move to the top.</p>
    <div className="picker-tools">
      <input type="search" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
      <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
        <option value="">All categories</option>{categories.map(d => <option key={d} value={d}>{name(d)}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={onlyValued} onChange={e => setOnlyValued(e.target.checked)} />Only my picks</label>
      {must > 0 && <button onClick={() => setMustHave(() => ({}))}>Clear {must} must</button>}
    </div>
    <div className="picker-list grouped">{sections.map(([title, list]) => <div key={title} className="pick-section">
      <h4>{title} <span className="muted small">{list.length}</span></h4>
      <div className="pick-grid">{list.map(row)}</div>
    </div>)}</div>
  </>;
}

// One badge or animation: Must (tier buttons), importance dropdown, "Up to" tier cap. Click the name to expand
// the per-tier requirements (accordion).
function GoalRow({ goal: b, prefs, setPrefs, mustHave, setMustHave }) {
  const [open, setOpen] = useState(false);
  const v = valueOf(prefs, b), cap = capOf(prefs, b), oneTier = b.tiers.length === 1, m = mustHave[b.name] ?? '';
  const options = oneTier ? [['', '–'], ['bronze', '✓']] : [['', '–'], ...tiers.map(t => [t, tierShort(t)])];
  const auto = usesMeta(prefs, b) || (isAnimation(b) && prefs.values?.[b.name] === undefined);
  const setValue = x => setPrefs(p => { const values = { ...p.values }; if (x === 'auto') delete values[b.name]; else values[b.name] = x;
    return { ...p, role: undefined, values }; });
  const metaText = `Auto · meta ${metaWord(Math.max(metaOf(b, 'PG'), metaOf(b, 'SF'), metaOf(b, 'C')))}`;
  const setCap = x => setPrefs(p => ({ ...p, caps: { ...p.caps, [b.name]: x || undefined } }));
  return <div className={'pick-row' + (m ? ' on' : '') + (open ? ' open' : '')}>
    <div className="pick-main">
      <button className="pick-name linkish" aria-expanded={open} onClick={() => setOpen(!open)}
        title="Show requirements"><i style={{ background: disciplineColour(b.discipline) }} />{goalLabel(b)}
        {(b.height_inches[0] > 69 || b.height_inches[1] < 88) && <small>{feet(b.height_inches[0])}–{feet(b.height_inches[1])}</small>}
        <span className="caret">{open ? '▾' : '▸'}</span></button>
      <div className="tier-buttons">
        <span className="must-label">Must</span>
        {options.map(([t, text]) => <button key={t || 'none'} className={'tb must-tb' + (m === t ? ' on' : '') + (t ? ' ' + t : ' none')}
          aria-pressed={m === t} title={t ? `Every result must have ${label(t)}` : 'Not required'}
          onClick={() => setMustHave(x => ({ ...x, [b.name]: t || undefined }))}>{text}</button>)}
        <select className={'mini-select' + (!auto && v > 0 ? ' on' : '')} aria-label={`${goalLabel(b)} importance`} value={auto ? 'auto' : v}
          title={`How much it's worth paying for beyond any Must. Auto = the meta decides (leftover points/breakers only).` +
            ` Meta: guard ${metaOf(b, 'PG')} · wing ${metaOf(b, 'SF')} · big ${metaOf(b, 'C')} (of 3).`}
          onChange={e => setValue(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
          <option value="auto">{metaText}</option>
          {IMPORTANCE.map(([iv, t]) => <option key={iv} value={iv}>{t}</option>)}</select>
        {!oneTier && <select className="mini-select" aria-label={`${goalLabel(b)} pay up to`}
          value={prefs.caps?.[b.name] ?? 0}
          title="Highest tier worth paying for (applies to Musts too). Any: no limit on your picks; on Auto the meta stops where
it says the badge stops paying." onChange={e => setCap(Number(e.target.value))}>
          <option value={0}>{auto && META_CAPS[b.name] ? `Up to: meta (${label(tiers[META_CAPS[b.name] - 1])})` : 'Up to: any'}</option>
          {[1, 2, 3, 4].map(r => <option key={r} value={r}>Up to {label(tiers[r - 1])}</option>)}</select>}
      </div>
    </div>
    {open && <div className="pick-detail">
      {b.tiers.map(t => <div key={t.tier} className="req-line">{!oneTier && <TierPill tier={t.tier} small />}
        <span>{requirementText(b, t.tier)}</span></div>)}
      {b.note && <p className="muted small">{b.note}</p>}
    </div>}
  </div>;
}

// Seconds since start, ticking.
export function Elapsed({ started }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  return started ? <b className="elapsed">{Math.floor((performance.now() - started) / 1000)}s</b> : null;
}

// Contact dunks / alley-oops are levels of the same rating: pick the highest you need and every result has it (the lower ones
// come with it). Smalls-only and bigs-only levels show when your height range includes them.
const LADDERS = [
  { id: 'dunks', label: 'Contact dunks', levels: [['small_contact_off_two', 'Small', 'S'], ['pro_contact_off_two', 'Pro'], ['pro_contact_off_one', 'Pro off one'],
    ['small_contact_off_one', 'Small off one', 'S'], ['elite_contact_off_two', 'Elite'], ['elite_contact_off_one', 'Elite off one']] },
  { id: 'oops', label: 'Alley-oops', levels: [['pro_contact_oop', 'Pro'], ['small_contact_oop', 'Small', 'S'], ['elite_contact_oop', 'Elite']] },
  { id: 'bigman', label: 'Bigman dunks', levels: [['pro_bigman_contact', 'Pro'], ['bigman_contact_oop', 'Oop'], ['elite_bigman_contact', 'Elite']] },
];
const reqShort = g => g.tiers[0].requirements.map(r => `${({ driving_dunk: 'DNK', standing_dunk: 'SDK', vertical: 'VRT' })[r.name]} ${r.minimum}`).join(' · ');
function DunkLadders({ prefs, setPrefs, mustHave, setMustHave, heights }) {
  const [detail, setDetail] = useState(false);
  const shown = (g, only) => g.height_inches[0] <= heights[1] && g.height_inches[1] >= heights[0];
  return <div className="ladders">
    {LADDERS.map(l => {
      const levels = l.levels.map(([k, text, only]) => ({ g: byName[k], text, only })).filter(x => x.g && shown(x.g));
      if (!levels.length) return null;
      const on = levels.findLast(x => mustHave[x.g.name])?.g.name ?? '';
      const pick = key => setMustHave(m => { const next = { ...m }; for (const x of levels) delete next[x.g.name]; if (key) next[key] = 'bronze'; return next; });
      return <div key={l.id} className="ladder"><span className="ladder-name">{l.label}</span>
        <div className="seg" role="group" aria-label={l.label}>
          <button className={!on ? 'on' : ''} aria-pressed={!on} onClick={() => pick('')}>Any</button>
          {levels.map(x => <button key={x.g.name} className={on === x.g.name ? 'on' : ''} aria-pressed={on === x.g.name}
            title={`${goalLabel(x.g)}: ${reqShort(x.g)}${x.only ? ' (5′9″–6′4″ only)' : ''}. Every result must have it.`} onClick={() => pick(on === x.g.name ? '' : x.g.name)}>
            <b>{x.text}</b><small>{reqShort(x.g)}</small></button>)}
        </div></div>;
    })}
    <button className="linkish small" onClick={() => setDetail(!detail)}>{detail ? 'Hide' : 'Show'} per-package importance</button>
    {detail && <div className="pick-grid">{animationGoals.map(g => <GoalRow key={g.name} goal={g} prefs={prefs} setPrefs={setPrefs}
      mustHave={mustHave} setMustHave={setMustHave} />)}</div>}
  </div>;
}

// Animations you want, by search: each one becomes a requirement (the ratings it needs are minimums). Saved profiles
// (e.g. "Bigs", "Guards") hold a set of animations and, optionally, attribute minimums.
function AnimationWants({ prefs, setPrefs, mustHave, setMustHave, heights, notify }) {
  const wants = prefs.wantAnims ?? [];
  const keys = wants.map(wantKey);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [group, setGroup] = useState('');
  const [active, setActive] = useState(0);
  const [focus, setFocus] = useState(false);
  const [jumper, setJumper] = useState(null); // custom jumper form
  const hits = useMemo(() => searchAnimations(query, { limit: type || group ? 60 : 12, tab: type, group }), [query, type, group]);
  const add = a => { if (!keys.includes(a.key)) setPrefs(p => ({ ...p, wantAnims: [...(p.wantAnims ?? []), a.custom ? a : a.key] })); setQuery(''); setActive(0); };
  const remove = key => setPrefs(p => ({ ...p, wantAnims: (p.wantAnims ?? []).filter(k => wantKey(k) !== key) }));
  const mins = wantMinimums(wants, {});
  const away = outOfRange(wants, heights);
  const dunkOn = animationGoals.filter(g => mustHave[g.name]).length;
  const count = wants.length + dunkOn;
  const showList = hits.length > 0 && (focus || query);
  return <details className="animations" open={count > 0 || undefined}>
    <summary><h3>Animations {count > 0 && <span className="count">{count}</span>}</h3></summary>
    <DunkLadders prefs={prefs} setPrefs={setPrefs} mustHave={mustHave} setMustHave={setMustHave} heights={heights} />
    <h4 className="sub-head">Any animation</h4>
    <p className="muted small">Search HQ's glossary or narrow it by type and group, then add what you want: the Lab only shows builds that unlock it.</p>
    <div className="picker-tools labelled anim-filters">
      <label className="field compact"><span>Type</span><select value={type} onChange={e => { setType(e.target.value); setGroup(''); }}>
        <option value="">All types</option>{animationTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label className="field compact"><span>Group</span><select value={group} onChange={e => setGroup(e.target.value)}>
        <option value="">All groups</option>{groupsOf(type).map(g => <option key={g} value={g}>{g}</option>)}</select></label>
      <div className="combo field compact grow"><span>Find</span>
        <input type="search" role="combobox" aria-expanded={showList} placeholder={type || group ? 'Filter by player name…' : 'Player or animation: “curry”, “sig size-up”…'}
          value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && hits[active]) { e.preventDefault(); add(hits[active]); }
            if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
          }} />
        {showList && <ul role="listbox" className="combo-list">{hits.map((a, k) => <li key={a.key} role="option" aria-selected={k === active}
          className={(k === active ? 'active' : '') + (keys.includes(a.key) ? ' on' : '')} onMouseEnter={() => setActive(k)} onMouseDown={e => { e.preventDefault(); add(a); }}>
          <b>{a.name}</b> <span className="muted">{a.group}</span><small>{requirementLabel(a, name)} · {sizesText(a.sizes)}</small></li>)}</ul>}
      </div>
      <button className="mini-btn" onClick={() => setJumper(jumper ? null : { base: '', r1: '', r2: '', blend: 50, req: 80 })}>＋ Custom jumper</button>
    </div>
    {jumper && <div className="custom-jumper">
      <p className="muted small">Your custom jump shot's requirement as the game shows it (2K hasn't published how the upper releases and blend set it, so
        enter the number from the jumpshot creator). It's a three point <i>or</i> mid-range minimum, like every jumper.</p>
      <div className="picker-tools labelled">
        <label className="field compact"><span>Base</span><input type="text" placeholder="e.g. WNBA 7" value={jumper.base} onChange={e => setJumper({ ...jumper, base: e.target.value })} /></label>
        <label className="field compact"><span>Upper release 1</span><input type="text" placeholder="e.g. Beluba" value={jumper.r1} onChange={e => setJumper({ ...jumper, r1: e.target.value })} /></label>
        <label className="field compact"><span>Upper release 2</span><input type="text" placeholder="e.g. Bassey" value={jumper.r2} onChange={e => setJumper({ ...jumper, r2: e.target.value })} /></label>
        <label className="field compact narrow"><span>Blend (release 1 %)</span><NumberInput title="Blend" min={0} max={100} value={jumper.blend} onChange={v => setJumper({ ...jumper, blend: v })} /></label>
        <label className="field compact narrow"><span>Needs (3PT or mid)</span><NumberInput title="Requirement" min={25} max={99} value={jumper.req} onChange={v => setJumper({ ...jumper, req: v })} /></label>
        <button className="mini-btn primary" onClick={() => { add(customJumper(jumper)); setJumper(null); notify('Custom jumper added as a requirement.'); }}>Add</button>
      </div></div>}
    {wants.length > 0 && <div className="chips want-chips">{wants.map(w => { const a = findAnimation(w); return a && <span key={a.key} className="chip"
      title={`${a.tab} · ${sizesText(a.sizes)}`}><b>{a.name}</b> <span className="muted small">{a.group} · {requirementLabel(a, name)}</span>
      <button className="linkish" aria-label={`Remove ${a.name}`} onClick={() => remove(a.key)}>×</button></span>; })}</div>}
    {wants.length > 0 && <p className="muted small">Adds minimums: {Object.entries(mins).map(([k, v]) => `${name(k)} ${v}`).join(', ')}
      {' '}(for “either” requirements: the one you already need, or the cheaper).</p>}
    {away.length > 0 && <p className="warn small">{away.map(a => a.name).join(', ')}: not available at your heights ({sizesText(away[0].sizes)} only).</p>}
    <AnimationProfiles prefs={prefs} setPrefs={setPrefs} mustHave={mustHave} setMustHave={setMustHave} notify={notify} />
  </details>;
}

// One optimized plan: ratings, badges today vs. with future breakers, and the breaker order.
export function PlanCard({ plan: p, rank, prefs, current, onOpen, onCompare, onSave, variant, compareTo, mode = '5v5', openLabel = 'Open in Builder' }) {
  // Breakers tried on the card (see BreakerChart onStep): null = the plan's own.
  const [tried, setTried] = useState(null);
  useEffect(() => setTried(null), [p]);
  const build = { body: p.body, base: p.manual, breakers: tried ?? p.breakers, budget: p.budget, category: p.category, specialCount: p.specialCount };
  const d = useMemo(() => derive(build), [p, tried]);
  const onStep = (i, count) => setTried(t => { const next = (t ?? p.breakers).map((n, j) => j === i ? count : n);
    return next.every((n, j) => n === p.breakers[j]) ? null : next; });
  const [chartOpen, setChartOpen] = useState(false), [focus, setFocus] = useState(null);
  const nowCount = (p.now ?? p.budget) + (p.specialCount ?? 0);
  const today = useMemo(() => p.today ? new Map(goals.map(b => [b.name, badgeTier(b, p.today, p.body.height)])) : null, [p]);
  const continuous = prefs.continuous.map(k => attributes.find(a => a.name === k).index);
  const reached = goals.map(g => ({ goal: g, tier: badgeTier(g, d.final, p.body.height) }))
    .filter(x => x.tier && (valueOf(prefs, x.goal) > 0 || (usesMeta(prefs, x.goal) && metaOf(x.goal, p.body.position) > 0)));
  const meta = metaScore(d.final, p.body.height, p.body.position, mode, nearOfDerived(d));
  const key = reached.filter(x => valueOf(prefs, x.goal) >= 2);
  const other = reached.filter(x => valueOf(prefs, x.goal) < 2);
  const chip = ({ goal, tier }) => {
    const now = today?.get(goal.name);
    const later = now !== tier;
    return <span key={goal.name} className={'chip' + (later ? ' later' : '')}
      title={(later ? `${now ? label(now) : 'Locked'} until the later breakers. ` : '') + (goal.note ?? requirementText(goal, tier))}>
      {goal.tiers.length > 1 && <TierPill tier={tier} small />} {goalLabel(goal)}{later && ' ⏳'}</span>;
  };
  const diff = useMemo(() => compareTo ? aspectsOf(p, compareTo, variant) : null, [p, compareTo, variant]);
  return <article className={'result plan' + (current ? ' is-current' : '') + (variant ? ' is-variant' : '')}>
    {variant && <div className="variant-head"><b>{variant.label}</b> <span className="muted small">{variant.blurb}</span>
      {diff?.length > 0 && <div className="aspect-chips">{diff.map(d => <span key={d.text} className={'aspect ' + (d.good ? 'up' : 'down')}
        title={`${d.x > 0 ? '+' : ''}${d.x} rating points vs #1`}>{d.good ? '▲' : '▼'} {d.text}</span>)}</div>}</div>}
    <header>
      {!variant && <div className="rank">{rank}</div>}
      <div><h3>{d.finalName ?? 'Unnamed build'}{current && <span className="chip">starting body</span>}
</h3><BodyLine body={p.body} also={p.alsoPositions ?? []} />
        {p.alsoWeights?.length > 0 && <div className="small muted" title="The same build (within a few rating points) also works at these weights">Also {[...new Set(p.alsoWeights)].sort((x, y) => x - y).join(', ')} lb</div>}</div>
      <div className="result-stats">
        <span title="Meta score: meta worth × tier (up to the meta's tier caps)">{meta.toFixed(1)}<small>meta</small></span>
        <span title={tried ? 'Your picks score of the plan as optimized (the breakers you are trying change the other numbers)' : 'Your picks: your importance × tier + feel + meta for badges left on Auto'}
          className={tried ? 'stale' : ''}>{p.value.toFixed(1)}<small>picks</small></span>
        <span title="Badge tiers unlocked">{d.unlocked.length}<small>badges</small></span>
        <span title="Cap Breakers planned">{d.breakerCount}<small>breakers</small></span>
      </div>
    </header>
    <MiniRatings final={d.final} highlight={continuous} caps={d.caps} breakers={d.applied} base={d.ratings}
      onPick={i => { setFocus(i); setChartOpen(true); }} picked={chartOpen ? focus : null} />
    {key.length > 0 && <div className="plan-badges"><h4>Key</h4><div className="chips">{key.map(chip)}</div></div>}
    {other.length > 0 && <details className="plan-badges"><summary>{other.length} more you care about · {d.unlocked.length} badges total</summary>
      <div className="chips">{other.map(chip)}</div></details>}
    {p.schedule?.length > 0 && <details className="plan-badges">
      <summary>Cap Breaker order ({p.schedule.length})</summary>
      <ol className="schedule">{p.schedule.map((s, k) => <React.Fragment key={k}>
        {k === nowCount && <li className="divider">Later ({p.schedule.length - nowCount})</li>}
        <li className={k >= nowCount ? 'later' : ''}><b>{name(attributes[s.attribute].name)}</b> {s.from}→{s.to}
          {s.specialized && <span className="chip">spec</span>}
          {s.gained.length > 0 && <small> {s.gained.map(g => `${goalLabel(goals.find(x => x.name === g.badge))}${goals.find(x => x.name === g.badge).tiers.length > 1 ? ' ' + tierShort(g.tier) : ''}`).join(', ')}</small>}</li>
      </React.Fragment>)}</ol>
    </details>}
    <BreakerChartDetails d={d} open={chartOpen} onToggle={setChartOpen} focus={focus} onStep={onStep} edited={!!tried} onReset={() => setTried(null)} />
    <RatingReasons d={d} prefs={prefs} />
    <footer>
      <button className="primary" onClick={() => onOpen({ ...build, manual: p.manual })}>{openLabel}</button>
      {onCompare && <button onClick={() => onCompare({ ...build, manual: p.manual })}>Compare</button>}
      {onSave && <button onClick={() => onSave({ ...build, manual: p.manual })}>Save</button>}

    </footer>
  </article>;
}
