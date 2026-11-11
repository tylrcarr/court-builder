import React, { useMemo, useState } from 'react';
import { attributes, feet, name } from '../engine.js';
import { strengthsOf } from '../vibes.js';
import { derive } from './derive.js';
import { BodyLine, HeightRange, MiniRatings, PositionToggles, ResultsList, SearchStatus, useSearch } from './common.jsx';

// Finds builds on other bodies that keep the same strengths as a reference build.
export default function SimilarView({ build, library, onOpen, onCompare, onSave }) {
  const [source, setSource] = useState('current');
  const [tolerance, setTolerance] = useState(4);
  const [keep, setKeep] = useState(7);
  const [positionsSel, setPositions] = useState([]);
  const [heights, setHeights] = useState([69, 88]);
  const [state, run, cancel] = useSearch();
  const ref = source === 'current' ? build : library.find(b => b.id === source) ?? build;
  const d = useMemo(() => derive(ref), [ref]);
  const strengths = strengthsOf(d.final, keep);
  const sameName = state.result?.results.filter(r => derive({ body: r.body, base: r.manual, breakers: r.breakers }).finalName === d.finalName).length;

  function start() {
    const goals = attributes.map(() => 25);
    for (const s of strengths) goals[s.index] = Math.max(25, d.final[s.index] - tolerance);
    const weights = d.final.map(v => 0.1 + 3 * ((v - 25) / 74) ** 2);
    run({ positions: positionsSel, heights, goals, weights, reference: d.final, limit: 12,
      breakers: { general: Math.max(ref.budget ?? 0, d.breakerCount), special: { category: ref.category ?? '', count: ref.specialCount ?? 0 } } });
  }

  return <div className="similar">
    <section className="card">
      <div className="card-head"><div><h2>Find similar builds</h2>
        <p className="muted">Keeps the reference build's top strengths (within your tolerance) and searches other bodies for the
          closest overall rating profile. Use it to find a taller, faster or longer version of a build you like.</p></div></div>
      <div className="config-grid">
        <div className="config-block grow">
          <label className="field"><span>Reference build</span>
            <select value={source} onChange={e => setSource(e.target.value)}>
              <option value="current">Current builder build</option>
              {library.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select></label>
          <div className="ref-card"><h3>{d.finalName ?? 'Unnamed build'}</h3><BodyLine body={ref.body} />
            <MiniRatings final={d.final} highlight={strengths.map(s => s.index)} caps={d.caps} /></div>
        </div>
        <div className="config-block">
          <h3>Keep these strengths</h3>
          <label className="field"><span>How many strengths: {keep}</span>
            <input type="range" min={3} max={12} value={keep} onChange={e => setKeep(Number(e.target.value))} /></label>
          <label className="field"><span>Tolerance: within {tolerance} points</span>
            <input type="range" min={0} max={15} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} /></label>
          <div className="chips">{strengths.map(s => <span key={s.name} className="chip">{name(s.name)} <b>≥{Math.max(25, s.value - tolerance)}</b></span>)}</div>
          <h3>Search where</h3>
          <PositionToggles value={positionsSel} onChange={setPositions} />
          <HeightRange value={heights} onChange={setHeights} />
          <p className="muted small">Reference is {feet(ref.body.height)}. Leave positions empty to search all.</p>
        </div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={state.running} onClick={start}>{state.running ? 'Searching…' : 'Find similar'}</button>
        {state.running && <button onClick={cancel}>Cancel</button>}
        <SearchStatus state={state} noun="similar builds" />
        {sameName > 0 && <span className="muted small">{sameName} keep the name “{d.finalName}”.</span>}
      </div>
    </section>
    <ResultsList results={state.result?.results.filter(r => !(r.body.height === ref.body.height && r.body.weight === ref.body.weight
      && r.body.wingspan === ref.body.wingspan))} highlight={strengths.map(s => s.index)} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />
  </div>;
}
