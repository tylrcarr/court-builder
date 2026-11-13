import React, { useEffect, useMemo, useState } from 'react';
import { attributes, feet, positions } from '../engine.js';
import { bodiesFor } from '../breakpoints.js';
import { bestFrame, capsAcross, hintsAcross, huntScore, perBreaker, pickCandidates, rangeBodies, shortOf, tableAcross, targetsFirst } from '../hunt.js';
import { PlanCard, optimizerOptions, usePool } from './LabView.jsx';
import { Archetype, HeightRange, NumberInput, Select, label } from './common.jsx';
import { groups } from '../derive.js';
import { name } from '../engine.js';

// Test tab. Pick up to 3 attributes for Cap Breakers to carry, one at a time; after each pick the archetypes are
// ranked by how far 5 breakers push them across the positions/heights you're searching. Then find bodies where that archetype can really be locked in, and builds.
const MAX_PICKS = 3;
const SHOWN = 10;
const short = i => label(attributes[i].name);

// Saved in localStorage: the current search (and its last results) plus named searches. Attributes are stored by name
// so the saves survive changes to the attribute order.
const KEY = 'court-builder.hunt.v1', SAVED_KEY = 'court-builder.hunt-searches.v1';
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full or blocked */ } };
const indexOf = n => attributes.findIndex(a => a.name === n);
const byName = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([i, v]) => [attributes[i]?.name, v]).filter(([k]) => k));
const byIndex = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([n, v]) => [indexOf(n), v]).filter(([i]) => i >= 0));
const DEFAULTS = { picks: [], want: {}, where: { positions: ['SG'], heights: [76, 81] }, need: {},
  breakers: { general: 15, future: 0, special: { category: 'shooting' } }, minStep: 2, sortBy: 'gain' };
const toSaved = c => ({ ...c, picks: c.picks.map(i => attributes[i].name), want: byName(c.want), need: byName(c.need) });
const fromSaved = ({ mode, elite, ...c } = {}) => ({ ...DEFAULTS, ...c, picks: (c?.picks ?? []).map(indexOf).filter(i => i >= 0),
  want: byIndex(c?.want), need: byIndex(c?.need) });

export default function HuntView({ prefs, labCfg, onOpen, onCompare, onSave, notify }) {
  const [initial] = useState(() => { const c = load(KEY, null); return { cfg: fromSaved(c ?? {}), result: c?.result ?? null, ms: c?.ms }; });
  const [picks, setPicks] = useState(initial.cfg.picks);
  const [want, setWant] = useState(initial.cfg.want); // attribute index → target final rating (absent = body's cap)
  const [where, setWhere] = useState(initial.cfg.where);
  const [need, setNeed] = useState(initial.cfg.need); // attribute index → minimum final rating the builds must also have
  const [needPick, setNeedPick] = useState(attributes.findIndex(a => a.name === 'defensive_rebound'));
  const [breakers, setBreakers] = useState(initial.cfg.breakers);
  const [state, setState] = useState({ running: false, result: initial.result, ms: initial.ms });
  const [sortBy, setSortBy] = useState(initial.cfg.sortBy);
  const [minStep, setMinStep] = useState(initial.cfg.minStep);
  const [show, setShow] = useState('all'); // all | now (fits your breakers) | later (needs more)
  const [saved, setSaved] = useState(() => load(SAVED_KEY, []));
  const [saveName, setSaveName] = useState('');
  const cfg = { picks, want, where, need, breakers, minStep, sortBy };
  // Results are kept with the search they came from (resultPicks), so changing the picks afterwards doesn't relabel them.
  useEffect(() => { if (!state.running) store(KEY, { ...toSaved(cfg), result: state.result ?? null, ms: state.ms }); },
    [picks, want, where, need, breakers, minStep, sortBy, state.running, state.result]);
  useEffect(() => store(SAVED_KEY, saved), [saved]);
  // Another open tab saved or deleted a hunt: pick it up instead of overwriting it with this tab's list.
  useEffect(() => {
    const onStorage = e => { if (e.key === SAVED_KEY) setSaved(load(SAVED_KEY, [])); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const apply = c => { const f = fromSaved(c); setPicks(f.picks); setWant(f.want); setWhere(f.where); setNeed(f.need);
    setBreakers(f.breakers); setMinStep(f.minStep); setSortBy(f.sortBy); setState({ running: false, result: c.result ?? null, ms: c.ms }); };
  const saveSearch = () => {
    const title = saveName.trim() || picks.map(short).join(' + ') || 'Breaker hunt';
    const entry = { id: crypto.randomUUID(), title, ...toSaved(cfg), result: state.result ?? null, ms: state.ms };
    setSaved(list => [entry, ...list.filter(x => x.title.toLowerCase() !== title.toLowerCase())].slice(0, 30));
    setSaveName(''); notify(`Saved hunt “${title}”${state.result ? ' with its results' : ''}.`);
  };
  const pool = usePool();

  // Every position: they share heights and differ only a little in weight range, so picking one just hides frames.
  const posList = Object.keys(positions);
  const bodies = useMemo(() => rangeBodies(posList, where.heights), [posList.join(), where.heights.join()]);
  // Highest cap anywhere in the range (every frame, not just the mid one) for the targets' default.
  const caps = useMemo(() => capsAcross(bodiesFor(posList, where.heights, { frames: 2 })), [where.heights.join()]);
  const great = useMemo(() => picks.length ? tableAcross(picks, bodies, want, minStep) : [], [picks, want, minStep, bodies]);
  const hints = useMemo(() => picks.length < MAX_PICKS ? hintsAcross(picks, bodies, want, minStep) : [], [picks, want, minStep, bodies]);
  const bestHint = Math.max(0, ...hints.filter(x => x != null));

  const toggle = i => setPicks(p => p.includes(i) ? p.filter(x => x !== i) : p.length < MAX_PICKS ? [...p, i] : p);

  async function run() {
    pool.cancel();
    const mine = pool.token.current, live = () => mine === pool.token.current, started = performance.now();
    const heights = Array.from({ length: where.heights[1] - where.heights[0] + 1 }, (_, k) => where.heights[0] + k);
    const tag = picks.map(i => attributes[i].name);
    setState({ running: true, progress: { label: 'Finding archetypes that lock in', done: 0, total: heights.length } });
    const screened = await pool.runJobs(heights.map(h =>
      ({ kind: 'huntScreen', options: { positions: posList, heights: [h, h], picks, want, breakers, minStep, need } })),
    (done, total) => live() && setState(s => ({ ...s, progress: { ...s.progress, done, total } })));
    if (!live()) return;
    const found = screened.flatMap(r => r?.found ?? []);
    const bodies = screened.reduce((s, r) => s + (r?.screened ?? 0), 0);
    const chosen = pickCandidates(found);
    if (!chosen.length) { setState({ running: false, result: { bodies, found: 0, results: [], picks: tag } }); return; }
    const opts = { ...optimizerOptions(prefs, { ...labCfg, mustHave: {}, from: null, breakers }),
      minimums: attributes.map(() => 25), maximums: attributes.map(() => 99) };
    // Every family is built on each of its frames (weights × meta groups) and the best one wins: your targets first,
    // then meta score.
    const jobs = chosen.flatMap((c, k) => c.frames.map(candidate => ({ k, candidate })));
    setState(s => ({ ...s, progress: { label: `Building ${chosen.length} builds on ${jobs.length} frames`, done: 0, total: jobs.length } }));
    const built = await pool.runJobs(jobs.map(({ candidate }) => ({ kind: 'huntBuild', options: { candidate, opts } })),
      (done, total) => live() && setState(s => ({ ...s, progress: { ...s.progress, done, total } })));
    if (!live()) return;
    const results = chosen.map((c, k) => {
      const mine = built.filter((_, j) => jobs[j].k === k);
      const best = bestFrame(mine);
      return best && { ...best, tested: mine.filter(r => r && !r.error).length };
    }).filter(Boolean);
    setState({ running: false, ms: performance.now() - started, result: { bodies, found: found.length, results, picks: tag } });
    if (!results.length) notify('Archetypes lock in, but the full builds failed. Try fewer or lower targets.');
  }

  const shownPicks = state.result?.picks ? state.result.picks.map(indexOf).filter(i => i >= 0) : picks;
  const usedOf = r => r.breakers.reduce((s, n) => s + n, 0);
  const gainOf = r => shownPicks.reduce((s, i) => s + r.final[i] - r.base[i], 0);
  const byMeta = (a, b) => (b.meta ?? 0) - (a.meta ?? 0);
  const all = state.result?.results ?? [];
  const whenOf = r => r.hunt?.when ?? 'now';
  // Builds that hit all your targets always come first; the sort decides among those (and among the rest, where each
  // point short costs meta).
  const results = all.filter(r => show === 'all' || whenOf(r) === show).sort((a, b) => targetsFirst(a, b) || (sortBy === 'meta'
    ? huntScore(b) - huntScore(a) : sortBy === 'fewest' ? usedOf(a) - usedOf(b) || huntScore(b) - huntScore(a)
    : gainOf(b) - gainOf(a) || huntScore(b) - huntScore(a)));

  return <div className="lab hunt">
    <section className="card">
      <div className="card-head"><div><h2>Breaker Hunt <span className="chip">test</span></h2>
        <p className="muted">Pick the attributes you want Cap Breakers to carry. Each breaker adds more when your archetype weighs
          that attribute lightly (and a lightly weighted rating is cheap in Overall), so the right archetype turns 5 breakers
          from +5 into +15 or more. Pick one at a time and watch which archetypes fit.</p></div>
        <div className="actions"><input type="text" placeholder="Search name (optional)" value={saveName} maxLength={60}
          onChange={e => setSaveName(e.target.value)} /><button onClick={saveSearch}>Save search</button>
          <button onClick={() => { apply(DEFAULTS); notify('Breaker Hunt reset.'); }}>Reset</button></div></div>
      {saved.length > 0 && <div className="saved-searches"><span className="muted small">Saved:</span>
        {saved.map(x => <span key={x.id} className="chip">
          <button className="linkish" title={x.result ? `${x.result.results.length} builds saved with it` : 'Settings only'}
            onClick={() => { apply(x); notify(`Loaded “${x.title}”.`); }}>{x.title}{x.result?.results?.length ? ` · ${x.result.results.length}` : ''}</button>
          <button className="linkish" aria-label={`Delete ${x.title}`} onClick={() => setSaved(l => l.filter(y => y.id !== x.id))}>×</button></span>)}</div>}

      <div className="config-block">
        <h3>1. Heights <span className="muted small">used for everything below: the archetype table, the hints and Find builds</span></h3>
        <HeightRange value={where.heights} onChange={heights => setWhere(w => ({ ...w, heights }))} />
        <p className="muted small">Every position at these heights ({bodies.length} height{bodies.length === 1 ? '' : 's'}). Archetype
          weights change with height and caps with the frame, so a wider range finds more.</p>
      </div>

      <div className="config-block">
        <h3>2. Attributes <span className="muted small">{picks.length}/{MAX_PICKS} picked{picks.length < MAX_PICKS && picks.length > 0
          ? ' · numbers = best breaker points with it added' : ''}</span></h3>
        <div className="sort-bar"><span className="muted small">Great breakers = at least</span>
          <div className="toggles" role="group" aria-label="Smallest average step">{[[0, 'Any'], [2, '+2'], [3, '+3'], [4, '+4']].map(([v, t]) =>
            <button key={v} className={minStep === v ? 'on' : ''} aria-pressed={minStep === v} onClick={() => setMinStep(v)}>{t}</button>)}</div>
          <span className="muted small">per breaker on every pick. Greyed attributes have no archetype that does that with your picks
            so far, on any of these bodies.</span></div>
        <div className="hunt-attrs">{attributes.map((a, i) => {
          const on = picks.includes(i), h = hints[i];
          const dead = !on && h === 0;
          return <button key={a.name} className={on ? 'on' : dead ? 'dead' : h != null && h === bestHint ? 'hint-best' : ''} aria-pressed={on}
            disabled={!on && picks.length >= MAX_PICKS} onClick={() => toggle(i)}
            title={on ? 'Remove' : dead ? `No archetype gives ${picks.length ? 'this and your picks' : 'this'} +${minStep} per breaker on these bodies`
              : h != null ? `Best archetype would get ${h} breaker points across your picks` : ''}>
            {on && <b>{picks.indexOf(i) + 1}</b>} {short(i)}{!on && h > 0 && <small> +{h}</small>}</button>;
        })}</div>
        {picks.length > 0 && <div className="hunt-targets">{picks.map(i =>
          <label key={i} className="field compact"><span>{short(i)} target</span>
            <NumberInput title={`${short(i)} target`} value={Math.min(want[i] || caps[i], caps[i])} min={40} max={99}
              onChange={v => setWant(w => ({ ...w, [i]: v >= caps[i] ? 0 : v }))} /></label>)}
          <p className="muted small">Final ratings to reach (the highest cap shown = each body's own cap). Steps shrink as a rating
            climbs, so a target below the cap (e.g. 90 vertical) can show far bigger gains.</p></div>}
      </div>

      {picks.length > 0 && <>
        <h3>3. Archetypes <span className="muted small">ranked by breaker points on your picks, across these bodies</span></h3>
        {great.length > 0 && <div className="table-wrap"><table className="hunt-table">
          <thead><tr><th>Body</th><th>Archetype</th><th>Points</th>{picks.map(i => <th key={i}>{short(i)}</th>)}<th>Built around (keep these high)</th></tr></thead>
          <tbody>{great.slice(0, SHOWN).map((r, k) => <tr key={k} className={k === 0 ? 'best' : ''}>
            <td>{r.positions.join('/')} {feet(r.height)} <span className="muted small">{r.weight} lb · {feet(r.wingspan)}</span></td><td>#{r.type}</td><td><b>+{r.total}</b></td>
            {r.per.map(p => <td key={p.i} title={`Weight in this archetype ${p.weight.toFixed(2)} (lower = bigger steps, cheaper base)`}>
              {p.base} → {p.target} <span className="muted small">({p.steps.join('+') || '—'}, +{perBreaker(p).toFixed(1)} avg)</span></td>)}
            <td className="muted small">{r.heavy.map(short).join(' · ')}</td></tr>)}</tbody>
        </table></div>}
        {!great.length && <p className="warn small">No archetype gives every pick +{minStep} per breaker on these bodies. Drop a pick,
          lower a target, lower the step or widen the heights.</p>}
        {great.length > SHOWN && <p className="muted small">Top {SHOWN} of {great.length}.</p>}
        <p className="muted small">Mid frame per height (all positions' frames combined); base → target with up to 5 breakers. This only says the gains are big: whether a
          build can really be that archetype (its heavy attributes must outscore the others under 99) is checked by Find builds.</p>
      </>}

      <div className="config-grid">
        <div className="config-block">
          <h3>4. Also require <span className="muted small">optional</span></h3>
          <div className="hunt-targets">
            <label className="field compact"><span>Attribute</span><select aria-label="Required attribute" value={needPick}
              onChange={e => setNeedPick(Number(e.target.value))}>{attributes.map((a, i) => <option key={a.name} value={i}>{short(i)}</option>)}</select></label>
            <button onClick={() => setNeed(n => ({ ...n, [needPick]: n[needPick] ?? Math.min(90, caps[needPick]) }))}>Add</button>
          </div>
          {Object.keys(need).length > 0 && <div className="hunt-targets">{Object.entries(need).map(([i, v]) =>
            <label key={i} className="field compact"><span>{short(Number(i))} at least</span>
              <span className="hunt-need"><NumberInput title={`${short(Number(i))} at least`} value={v} min={25} max={99}
                onChange={x => setNeed(n => ({ ...n, [i]: x }))} />
              <button className="mini-btn" aria-label={`Remove ${short(Number(i))}`}
                onClick={() => setNeed(n => { const { [i]: _, ...rest } = n; return rest; })}>×</button></span></label>)}</div>}
          <p className="muted small">Final ratings every build must also have, e.g. 95 Defensive Rebound. Bodies that can't reach it are
            skipped, and it can push some archetypes out (a high rating they weigh heavily changes who leads).</p>
        </div>
        <div className="config-block">
          <h3>Cap Breakers</h3>
          <div className="breaker-settings">
            <label className="field compact"><span>Have now</span><NumberInput title="Cap Breakers you have now" value={breakers.general}
              min={0} max={60} onChange={v => setBreakers(b => ({ ...b, general: v }))} /></label>
            <Select compact title="Specialization (+2)" value={breakers.special?.category ?? ''}
              options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => setBreakers(b => ({ ...b, special: { category: v } }))} />
          </div>
          <p className="muted small">Builds use exactly the breakers you have (getting as close to your targets as they can). When
            that falls short, you also get the fewest extra breakers that hit every target (up to a year's ~28), saying how many
            more you'd need and what your stats are today. Targets no number of breakers reaches get no “needs more” build.</p>
        </div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={state.running || !picks.length} onClick={run}>{state.running ? 'Hunting…' : 'Find builds'}</button>
        {state.running && <button onClick={() => { pool.cancel(); setState(s => ({ ...s, running: false })); }}>Cancel</button>}
        {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label}…
          {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''}</p>}
        {!state.running && state.result && <p className="status-line">{state.result.bodies} bodies screened, {state.result.found} body ×
          archetype combos lock in; built the best {state.result.results.length}{state.ms ? ` in ${(state.ms / 1000).toFixed(1)} s` : ''}.
          {!state.result.found && ` None lock in: lower a target${Object.keys(need).length ? ' or a requirement' : ''}, add breakers or widen the heights.`}</p>}
      </div>
    </section>

    {results.length > 0 && <>
      <h3 className="section-title">Builds</h3>
      <div className="sort-bar"><span className="muted small">Sort by</span>
        <div className="toggles" role="group" aria-label="Sort">{[['gain', 'Breaker gain'], ['meta', 'Meta score'], ['fewest', 'Fewest breakers']].map(([id, text]) =>
          <button key={id} className={sortBy === id ? 'on' : ''} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>{text}</button>)}</div>
        <span className="muted small">Show</span>
        <div className="toggles" role="group" aria-label="Show">{[['all', `All (${all.length})`],
          ['now', `Fits your ${breakers.general} (${all.filter(r => whenOf(r) === 'now').length})`],
          ['later', `Needs more (${all.filter(r => whenOf(r) === 'later').length})`]].map(([id, text]) =>
          <button key={id} className={show === id ? 'on' : ''} aria-pressed={show === id} onClick={() => setShow(id)}>{text}</button>)}</div></div>
      <div className="results">{results.map((r, k) => <div key={k} className="hunt-result">
        <div className="hunt-strip"><span className="chip"><Archetype height={r.body.height} type={r.playerType} /></span>
          {shownPicks.map(i => { const goal = r.hunt?.goal?.[i], short_ = goal != null && r.final[i] < goal;
            return <span key={i} className={'chip' + (short_ ? ' miss' : '')} title={`${r.breakers[i]} Cap Breakers${goal != null ? ` · target ${goal}` : ''}`}>
            {short(i)} {r.breakers[i] ? <>{r.base[i]} → <b>{r.final[i]}</b> (+{r.final[i] - r.base[i]}, {r.breakers[i]}×)</>
              : <><b>{r.final[i]}</b> by default</>}{short_ && <> · {goal - r.final[i]} short of {goal}</>}</span>; })}
          <span className="muted small">+{gainOf(r)} from breakers</span>
          {r.tested > 1 && <span className="muted small" title="Same height, wingspan and archetype built at other weights and positions; this one came out best">
            best of {r.tested} frames</span>}
          {(() => {
            const used = usedOf(r), have = (r.now ?? 0) + (r.specialCount ?? 0), more = used - have;
            return more > 0
              ? <span className="chip later" title="The rest of the breakers this build is planned for">⏳ uses {used} breakers · get {more} more
                  (you have {have}) · today {shownPicks.map(i => `${short(i)} ${r.today?.[i] ?? r.final[i]}`).join(', ')}</span>
              : <span className="chip">✓ uses {used} breakers · you have them</span>;
          })()}</div>
        <PlanCard rank={k + 1} plan={r} prefs={prefs} mode={labCfg.mode ?? 'both'} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />
      </div>)}</div>
    </>}
  </div>;
}
