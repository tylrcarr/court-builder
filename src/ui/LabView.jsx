import React, { useEffect, useMemo, useRef, useState } from 'react';
import { attributes, badgeTier, capsFor, feet, name, positions, tiers, typeWeights } from '../engine.js';
import { CONTINUOUS_WEIGHTS, IMPORTANCE, SPECIALIZATIONS, archetypeCandidates, byName, capOf, rankPlans, defaultPrefs, goals, heldTiers, metaScore, usesMeta, valueOf } from '../breakpoints.js';
import { META_CAPS, metaOf } from '../meta.js';
import { BROAD_VARIANTS, VARIANTS } from '../variants.js';
import { isAnimation } from '../animations.js';
import { MODES, ROLES, applyRole, withMode } from '../roles.js';
import { derive, groups, tierShort } from '../derive.js';
import { BodyLine, HeightRange, MiniRatings, NumberInput, PositionToggles, Select, TierPill, disciplineColour, label,
  requirementText } from './common.jsx';

export const defaultLab = () => ({
  positions: [], heights: [69, 88], mode: 'both',
  breakers: { general: 8, future: 0, special: { category: 'shooting' } },
  mustHave: {}, from: null, keepBadges: true,
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

// Runs many optimizer jobs across a pool of workers (one per spare CPU core). runJobs resolves with results in job
// order; cancel() stops everything.
export function usePool() {
  const workers = useRef([]);
  const token = useRef(0);
  const cancel = () => { workers.current.forEach(w => w.terminate()); workers.current = []; token.current++; };
  useEffect(() => cancel, []);
  const size = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
  const runJobs = (jobs, onDone) => new Promise(resolve => {
    const results = new Array(jobs.length), mine = token.current;
    let next = 0, done = 0;
    if (!jobs.length) return resolve(results);
    const spawn = () => {
      const w = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
      workers.current.push(w);
      const feed = () => {
        if (mine !== token.current) return;
        if (next >= jobs.length) { w.terminate(); workers.current = workers.current.filter(x => x !== w); return; }
        const k = next++;
        w.onmessage = ({ data }) => {
          if (data.progress) return;
          results[k] = data.error ? { error: data.error } : data.result;
          done++; onDone?.(done, jobs.length);
          if (done === jobs.length) resolve(results);
          feed();
        };
        w.onerror = () => { results[k] = { error: 'Worker failed' }; done++; onDone?.(done, jobs.length); if (done === jobs.length) resolve(results); feed(); };
        w.postMessage(jobs[k]);
      };
      feed();
    };
    for (let i = 0; i < Math.min(size, jobs.length); i++) spawn();
  });
  return { runJobs, cancel, token, size };
}

// Lab prefs + config → optimizer options. Starting from a build adds its valued badge tiers as must-haves.
export function optimizerOptions(rawPrefs, cfg) {
  const prefs = withMode(rawPrefs, cfg.mode ?? 'both');
  const minimums = attributes.map(a => Math.max(25, prefs.minimums?.[a.name] ?? 25));
  const maximums = attributes.map(a => prefs.maximums?.[a.name] ?? 99);
  const mustHave = { ...cfg.mustHave };
  if (cfg.from && cfg.keepBadges) {
    const d = derive(cfg.from);
    for (const [k, r] of heldTiers(d.final, cfg.from.body.height, prefs))
      if (tiers.indexOf(mustHave[k]) < r - 1) mustHave[k] = tiers[r - 1];
  }
  return { values: prefs.values, caps: prefs.caps, continuous: prefs.continuous, notFeel: prefs.notFeel, continuousWeights: prefs.continuousWeights ?? {},
    minimums, maximums, breakers: cfg.breakers, mustHave, mode: cfg.mode ?? 'both', metaRate: rawPrefs.metaRate ?? 1 };
}

export default function LabView({ build, prefs, setPrefs, cfg, setCfg, searches, setSearches, onOpen, onCompare, onSave, notify }) {
  const pool = usePool();
  const [state, setState] = useState({ running: false });
  const cancel = () => { pool.cancel(); setState(s => ({ ...s, running: false })); };
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
    const progress = label => (done, total) => live() && setState(s => ({ ...s, progress: { label, done, total } }));
    const opts = optimizerOptions(prefs, cfg);
    const where = { positions: positionsUsed, heights: cfg.heights };
    setState({ running: true, progress: { label: 'Screening bodies' } });
    const [scr] = await pool.runJobs([{ kind: 'screen', options: { ...where, around: cfg.from ? cfg.from.body : null, opts, keep: MAX_BUILDS } }]);
    if (!live()) return;
    if (scr.error) return setState({ running: false, error: scr.error });
    if (!scr.chosen.length) {
      setState(s => ({ ...s, progress: { label: 'Finding what blocks the search' } }));
      const [bl] = await pool.runJobs([{ kind: 'blockers', options: { ...where, opts } }]);
      if (!live()) return;
      return setState({ running: false, ms: performance.now() - started,
        result: { results: [], screened: 0, bodies: scr.bodies, blockers: Array.isArray(bl) ? bl : [] } });
    }
    const plans = await pool.runJobs(scr.chosen.map(c => ({ kind: 'body', options: { body: c.body, pinned: c.pinned, opts } })),
      progress(`Optimizing bodies (${pool.size} at a time${opts.archetypes ? ', trying archetypes' : ''})`));
    if (!live()) return;
    // Same body dimensions + same ratings at different positions are one build (position only sets the name/meta group).
    const results = [];
    for (const r of rankPlans(plans.filter(r => r && !r.error), opts)) {
      const twin = results.find(x => x.body.height === r.body.height && x.body.weight === r.body.weight && x.body.wingspan === r.body.wingspan
        && x.final.every((v, i) => v === r.final[i]));
      if (twin) twin.alsoPositions = [...(twin.alsoPositions ?? []), r.body.position];
      else results.push(r);
    }
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
        progress('Finding other ways to spend the points'));
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
    setState({ running: false, ms: performance.now() - started, result: { results, options, notes, screened: scr.screened, bodies: scr.bodies } });
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
    setSearches(list => [entry, ...list.filter(x => x.id !== entry.id)].slice(0, 30));
    setSearchName(''); setOverwrite(null);
    notify(clash ? `Overwrote search “${title}”.` : `Saved search “${title}”.`);
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

      <div className="roles"><span className="muted small">Start from a role:</span>
        {ROLES.map(r => <button key={r.id} className={prefs.role === r.id ? 'on' : ''} aria-pressed={prefs.role === r.id}
          title={r.blurb} onClick={() => pickRole(r)}>{r.label}</button>)}</div>
      {role && <p className="muted small">{role.blurb} Everything not listed is ∅ — adjust below.</p>}
      {searches.length > 0 && <div className="saved-searches"><span className="muted small">Saved:</span>
        {searches.map(s => <span key={s.id} className="chip">
          <button className="linkish" onClick={() => { setPrefs(s.prefs); setCfg({ ...defaultLab(), ...s.cfg }); notify(`Loaded “${s.title}”.`); }}>{s.title}</button>
          <button className="linkish" aria-label={`Delete ${s.title}`} onClick={() => setSearches(l => l.filter(x => x.id !== s.id))}>×</button></span>)}</div>}

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
          <AnimationChips prefs={prefs} setPrefs={setPrefs} mustHave={cfg.mustHave}
            setMustHave={fn => set(c => ({ mustHave: fn(c.mustHave) }))} />
        </div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={state.running} onClick={start}>{state.running ? 'Optimizing…' : 'Find builds'}</button>
        {state.running && <button onClick={cancel}>Cancel</button>}
        {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
          {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''}</p>}
        {!state.running && state.error && <p className="status-line warn">{state.error}</p>}
        {state.result && <p className="status-line">{state.result.screened} of {state.result.bodies} bodies can meet
          the must-haves and minimums; optimized the {state.result.results.length} with the most room{state.ms ? ` in ${(state.ms / 1000).toFixed(1)} s` : ''}.
          {!state.result.results.length && ' Nothing fits.'}</p>}
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
        ? metaScore(b.final, b.body.height, b.body.position, cfg.mode) - metaScore(a.final, a.body.height, a.body.position, cfg.mode) || b.value - a.value
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
  const left = 99 - t.ovr;
  const musts = Object.entries(mustHave ?? {}).filter(([, x]) => x);
  return <article className="result plan is-template">
    <div className="variant-head"><b>Requirements only</b> <span className="muted small">{t.needsBreakers
      ? 'Your musts, minimums and specialization don’t fit under 99 without Cap Breakers, so this one uses them.'
      : 'Just your musts, minimums and the specialization from base ratings, no Cap Breakers — what every option below starts from.'}</span></div>
    <div className="template-left"><b>{left.toFixed(1)}</b> Overall left to spend <span className="muted small">(uses {t.ovr.toFixed(1)} of 99)</span></div>
    <MiniRatings final={d.final} caps={d.caps} breakers={d.applied} base={d.ratings} />
    {musts.length > 0 && <div className="plan-badges"><h4>Musts</h4><div className="chips">{musts.map(([k, tier]) =>
      <span key={k} className="chip">{byName[k].tiers.length > 1 && <TierPill tier={tier} small />} {goalLabel(byName[k])}</span>)}</div></div>}
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

function BreakerPlan({ value, onChange }) {
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

// Animations: same rows as badges, in their own collapsible section.
function AnimationChips({ prefs, setPrefs, mustHave, setMustHave }) {
  const on = animationGoals.filter(g => mustHave[g.name] || valueOf(prefs, g) > 0).length;
  return <details className="animations" open={on > 0}>
    <summary><h3>Animations {on > 0 && <span className="count">{on}</span>}</h3></summary>
    <p className="muted small">Contact dunks and alley-oops (nba2klab table). Other animations (jumper bases, dribble styles) are best handled with a Min
      on the attribute.</p>
    <div className="pick-grid">{animationGoals.map(g => <GoalRow key={g.name} goal={g} prefs={prefs} setPrefs={setPrefs}
      mustHave={mustHave} setMustHave={setMustHave} />)}</div>
  </details>;
}

// One optimized plan: ratings, badges today vs. with future breakers, and the breaker order.
export function PlanCard({ plan: p, rank, prefs, current, onOpen, onCompare, onSave, variant, compareTo, mode = '5v5', openLabel = 'Open in Builder' }) {
  const build = { body: p.body, base: p.manual, breakers: p.breakers, budget: p.budget, category: p.category, specialCount: p.specialCount };
  const d = useMemo(() => derive(build), [p]);
  const nowCount = (p.now ?? p.budget) + (p.specialCount ?? 0);
  const today = useMemo(() => p.today ? new Map(goals.map(b => [b.name, badgeTier(b, p.today, p.body.height)])) : null, [p]);
  const continuous = prefs.continuous.map(k => attributes.find(a => a.name === k).index);
  const reached = goals.map(g => ({ goal: g, tier: badgeTier(g, d.final, p.body.height) }))
    .filter(x => x.tier && (valueOf(prefs, x.goal) > 0 || (usesMeta(prefs, x.goal) && metaOf(x.goal, p.body.position) > 0)));
  const meta = metaScore(d.final, p.body.height, p.body.position, mode);
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
      <div><h3>{d.finalName ?? 'Unnamed build'}{current && <span className="chip">starting body</span>}</h3><BodyLine body={p.body} also={p.alsoPositions ?? []} /></div>
      <div className="result-stats">
        <span title="Meta score: meta worth × tier (up to the meta's tier caps)">{meta.toFixed(1)}<small>meta</small></span>
        <span title="Your picks: your importance × tier + feel + meta for badges left on Auto">{p.value.toFixed(1)}<small>picks</small></span>
        <span title="Badge tiers unlocked">{d.unlocked.length}<small>badges</small></span>
        <span title="Cap Breakers planned">{d.breakerCount}<small>breakers</small></span>
      </div>
    </header>
    <MiniRatings final={d.final} highlight={continuous} caps={d.caps} breakers={d.applied} base={d.ratings} />
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
    <footer>
      <button className="primary" onClick={() => onOpen({ ...build, manual: p.manual })}>{openLabel}</button>
      {onCompare && <button onClick={() => onCompare({ ...build, manual: p.manual })}>Compare</button>}
      {onSave && <button onClick={() => onSave({ ...build, manual: p.manual })}>Save</button>}

    </footer>
  </article>;
}
