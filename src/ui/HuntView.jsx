import React, { useMemo, useState } from 'react';
import { attributes, capsFor, feet, positions } from '../engine.js';
import { archetypeTable, nextPickHints, pickCandidates, previewBody } from '../hunt.js';
import { BreakerPlan, PlanCard, optimizerOptions, usePool } from './LabView.jsx';
import { HeightRange, NumberInput, PositionToggles, Select, label } from './common.jsx';

// Test tab. Pick up to 3 attributes for Cap Breakers to carry, one at a time; after each pick the archetypes are
// ranked by how far 5 breakers push them. Then find bodies where that archetype can really be locked in, and builds.
const MAX_PICKS = 3;
const SHOWN = 8;
const short = i => label(attributes[i].name);

export default function HuntView({ prefs, labCfg, onOpen, onCompare, onSave, notify }) {
  const [picks, setPicks] = useState([]);
  const [want, setWant] = useState({}); // attribute index → target final rating (absent = body's cap)
  const [where, setWhere] = useState({ positions: ['SG'], heights: [76, 81] });
  const [preview, setPreview] = useState({ position: 'SG', height: 78 });
  const [breakers, setBreakers] = useState({ general: 15, future: 0, special: { category: 'shooting' } });
  const [state, setState] = useState({ running: false });
  const [sortBy, setSortBy] = useState('gain');
  const pool = usePool();

  const rows = positions[preview.position];
  const height = rows.some(r => r.height === preview.height) ? preview.height : rows[Math.floor(rows.length / 2)].height;
  const body = previewBody(preview.position, height);
  const caps = useMemo(() => capsFor(body), [body.position, body.height]);
  const table = useMemo(() => picks.length ? archetypeTable(picks, body, want) : [], [picks, want, body.position, body.height]);
  const hints = useMemo(() => picks.length < MAX_PICKS ? nextPickHints(picks, body, want) : [], [picks, want, body.position, body.height]);
  const bestHint = Math.max(0, ...hints.filter(x => x != null));

  const toggle = i => setPicks(p => p.includes(i) ? p.filter(x => x !== i) : p.length < MAX_PICKS ? [...p, i] : p);

  async function run() {
    pool.cancel();
    const mine = pool.token.current, live = () => mine === pool.token.current, started = performance.now();
    const posList = where.positions.length ? where.positions : Object.keys(positions);
    const heights = Array.from({ length: where.heights[1] - where.heights[0] + 1 }, (_, k) => where.heights[0] + k);
    setState({ running: true, progress: { label: 'Finding archetypes that lock in', done: 0, total: heights.length } });
    const screened = await pool.runJobs(heights.map(h => ({ kind: 'huntScreen',
      options: { positions: posList, heights: [h, h], picks, want, breakers } })),
    (done, total) => live() && setState(s => ({ ...s, progress: { ...s.progress, done, total } })));
    if (!live()) return;
    const found = screened.flatMap(r => r?.found ?? []);
    const bodies = screened.reduce((s, r) => s + (r?.screened ?? 0), 0);
    const chosen = pickCandidates(found);
    if (!chosen.length) { setState({ running: false, result: { bodies, found: 0, results: [] } }); return; }
    const opts = { ...optimizerOptions(prefs, { ...labCfg, mustHave: {}, from: null, breakers }),
      minimums: attributes.map(() => 25), maximums: attributes.map(() => 99) };
    setState(s => ({ ...s, progress: { label: 'Building', done: 0, total: chosen.length } }));
    const built = await pool.runJobs(chosen.map(candidate => ({ kind: 'huntBuild', options: { candidate, opts } })),
      (done, total) => live() && setState(s => ({ ...s, progress: { ...s.progress, done, total } })));
    if (!live()) return;
    const results = built.map((r, k) => r && !r.error ? { ...r, candidate: chosen[k] } : null).filter(Boolean);
    setState({ running: false, ms: performance.now() - started, result: { bodies, found: found.length, results } });
    if (!results.length) notify('Archetypes lock in, but the full builds failed. Try fewer or lower targets.');
  }

  const gainOf = r => picks.reduce((s, i) => s + r.final[i] - r.base[i], 0);
  const results = [...(state.result?.results ?? [])].sort((a, b) => sortBy === 'gain'
    ? gainOf(b) - gainOf(a) || (b.meta ?? 0) - (a.meta ?? 0) : (b.meta ?? 0) - (a.meta ?? 0));

  return <div className="lab hunt">
    <section className="card">
      <div className="card-head"><div><h2>Breaker Hunt <span className="chip">test</span></h2>
        <p className="muted">Pick the attributes you want Cap Breakers to carry. Each breaker adds more when your archetype weighs
          that attribute lightly (and a lightly weighted rating is cheap in Overall), so the right archetype turns 5 breakers
          from +5 into +15 or more. Pick one at a time and watch which archetypes fit.</p></div></div>

      <div className="config-grid">
        <div className="config-block grow-2">
          <h3>1. Attributes <span className="muted small">{picks.length}/{MAX_PICKS} picked{picks.length < MAX_PICKS && picks.length > 0
            ? ' · numbers = breaker points with it added' : ''}</span></h3>
          <div className="hunt-attrs">{attributes.map((a, i) => {
            const on = picks.includes(i), h = hints[i];
            return <button key={a.name} className={on ? 'on' : h != null && h === bestHint ? 'hint-best' : ''} aria-pressed={on}
              disabled={!on && picks.length >= MAX_PICKS} onClick={() => toggle(i)}
              title={on ? 'Remove' : h != null ? `Best archetype would get ${h} breaker points across your picks` : ''}>
              {on && <b>{picks.indexOf(i) + 1}</b>} {short(i)}{!on && h != null && <small> +{h}</small>}</button>;
          })}</div>
          {picks.length > 0 && <div className="hunt-targets">{picks.map(i =>
            <label key={i} className="field compact"><span>{short(i)} target</span>
              <NumberInput title={`${short(i)} target`} value={Math.min(want[i] || caps[i], caps[i])} min={40} max={99}
                onChange={v => setWant(w => ({ ...w, [i]: v }))} /></label>)}
            <p className="muted small">Final ratings to reach. Steps shrink as a rating climbs, so a target below the cap
              (e.g. 90 vertical) can show far bigger gains. Cap on the preview body: {picks.map(i => `${short(i)} ${caps[i]}`).join(', ')}.</p></div>}
        </div>
        <div className="config-block">
          <h3>Preview body</h3>
          <div className="range-pair">
            <Select compact title="Position" value={preview.position} options={Object.keys(positions).map(p => [p, p])}
              onChange={position => setPreview(p => ({ ...p, position }))} />
            <Select compact title="Height" value={height} options={rows.map(r => [r.height, feet(r.height)])}
              onChange={v => setPreview(p => ({ ...p, height: Number(v) }))} />
          </div>
          <p className="muted small">Archetypes and their weights change with height; the table uses a mid frame.</p>
        </div>
      </div>

      {table.length > 0 && <>
        <h3>2. Archetypes for a {preview.position} {feet(height)} <span className="muted small">ranked by breaker points on your picks</span></h3>
        <div className="table-wrap"><table className="hunt-table">
          <thead><tr><th>Archetype</th><th>Points</th>{picks.map(i => <th key={i}>{short(i)}</th>)}<th>Built around (keep these high)</th></tr></thead>
          <tbody>{table.slice(0, SHOWN).map((r, k) => <tr key={r.type} className={k === 0 ? 'best' : ''}>
            <td>#{r.type}</td><td><b>+{r.total}</b></td>
            {r.per.map(p => <td key={p.i} title={`Weight in this archetype ${p.weight.toFixed(2)} (lower = bigger steps, cheaper base)`}>
              {p.base} → {p.target} <span className="muted small">({p.steps.join('+') || '—'})</span></td>)}
            <td className="muted small">{r.heavy.map(short).join(' · ')}</td></tr>)}</tbody>
        </table></div>
        <p className="muted small">Base → target with up to 5 breakers. Rankings here only say the gains are big; whether the build
          can actually be that archetype (its heavy attributes must outscore the others under 99) is checked by Find builds.</p>
      </>}

      <div className="config-grid">
        <div className="config-block">
          <h3>3. Where to look</h3>
          <PositionToggles value={where.positions} onChange={p => setWhere(w => ({ ...w, positions: p }))} />
          <HeightRange value={where.heights} onChange={heights => setWhere(w => ({ ...w, heights }))} />
        </div>
        <div className="config-block">
          <h3>Cap Breakers</h3>
          <BreakerPlan value={breakers} onChange={setBreakers} />
          <p className="muted small">{MAX_PICKS} attributes × 5 = 15 to max them all; more go wherever they help most.</p>
        </div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={state.running || !picks.length} onClick={run}>{state.running ? 'Hunting…' : 'Find builds'}</button>
        {state.running && <button onClick={() => { pool.cancel(); setState(s => ({ ...s, running: false })); }}>Cancel</button>}
        {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label}…
          {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''}</p>}
        {!state.running && state.result && <p className="status-line">{state.result.bodies} bodies screened, {state.result.found} body ×
          archetype combos lock in; built the best {state.result.results.length}{state.ms ? ` in ${(state.ms / 1000).toFixed(1)} s` : ''}.
          {!state.result.found && ' None lock in: lower a target, add breakers or widen the heights.'}</p>}
      </div>
    </section>

    {results.length > 0 && <>
      <h3 className="section-title">Builds</h3>
      <div className="sort-bar"><span className="muted small">Sort by</span>
        <div className="toggles" role="group" aria-label="Sort">{[['gain', 'Breaker gain'], ['meta', 'Meta score']].map(([id, text]) =>
          <button key={id} className={sortBy === id ? 'on' : ''} aria-pressed={sortBy === id} onClick={() => setSortBy(id)}>{text}</button>)}</div></div>
      <div className="results">{results.map((r, k) => <div key={k} className="hunt-result">
        <div className="hunt-strip"><span className="chip">Archetype #{r.playerType}</span>
          {picks.map(i => <span key={i} className="chip" title={`${r.breakers[i]} Cap Breakers`}>
            {short(i)} {r.base[i]} → <b>{r.final[i]}</b> (+{r.final[i] - r.base[i]}, {r.breakers[i]}×)</span>)}
          <span className="muted small">+{gainOf(r)} from breakers</span></div>
        <PlanCard rank={k + 1} plan={r} prefs={prefs} mode={labCfg.mode ?? 'both'} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />
      </div>)}</div>
    </>}
  </div>;
}
