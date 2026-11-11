import React, { useMemo } from 'react';
import { attributes, name } from '../engine.js';
import { LEVELS, VIBES, VIBE_GROUPS, parseVibes, vibesToSearch } from '../vibes.js';
import { BreakerSettings, HeightRange, PositionToggles, ResultsList, SearchStatus, useSearch } from './common.jsx';

export const defaultVibes = () => ({ text: '', selection: {}, positions: [], heights: [69, 88], useFloors: true,
  breakers: { general: 8, special: { category: '', count: 0 } } });

const CYCLE = [undefined, 'nice', 'good', 'elite'];
const EXAMPLES = [
  'I want to shoot, score inside with close shot, rebound and pass with good speed, agility and perimeter defense',
  'Elite lockdown defender who can knock down threes and some rebounding',
  'Athletic slasher with elite dunks, decent handles and steals',
  'Big man rim protector, great rebounder, post moves and a bit of mid-range',
];

export default function VibesView({ vibes, setVibes, onOpen, onCompare, onSave }) {
  const [state, run, cancel] = useSearch();
  const set = patch => setVibes(v => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch) }));
  const { weights, goals } = useMemo(() => vibesToSearch(vibes.selection, { useFloors: vibes.useFloors }), [vibes.selection, vibes.useFloors]);
  const highlight = weights.map((w, i) => w >= 1 ? i : -1).filter(i => i >= 0);
  const count = Object.keys(vibes.selection).length;

  const interpret = text => set({ text, selection: parseVibes(text) });
  const cycle = id => {
    set(v => {
      const next = CYCLE[(CYCLE.indexOf(v.selection[id]) + 1) % CYCLE.length];
      const selection = { ...v.selection };
      if (next) selection[id] = next; else delete selection[id];
      return { selection };
    });
  };
  const start = () => run({ positions: vibes.positions, heights: vibes.heights, weights, goals,
    breakers: vibes.breakers, limit: 12 });

  return <div className="vibes">
    <section className="card">
      <div className="card-head"><div><h2>Vibes</h2>
        <p className="muted">Describe how you want to play. Each vibe becomes priorities (and, if enabled, sensible minimums),
          then every body is searched for the best fit.</p></div></div>
      <textarea className="vibe-text" rows={3} placeholder="e.g. I want to shoot, score inside, rebound and pass with good speed…"
        value={vibes.text} onChange={e => interpret(e.target.value)} />
      <div className="examples">{EXAMPLES.map(x => <button key={x} onClick={() => interpret(x)}>“{x.slice(0, 48)}…”</button>)}</div>
      <div className="vibe-groups">{VIBE_GROUPS.map(g => <div key={g} className="vibe-group"><h4>{g}</h4>
        <div className="chips">{VIBES.filter(v => v.group === g).map(v => {
          const level = vibes.selection[v.id];
          return <button key={v.id} className={'vibe ' + (level ?? '')} onClick={() => cycle(v.id)}
            title="Click to cycle: nice to have → good → elite → off">
            {v.label}{level && <small>{LEVELS.find(l => l.id === level).label}</small>}</button>;
        })}</div></div>)}</div>
      <div className="config-grid">
        <div className="config-block"><h3>Body (optional)</h3>
          <PositionToggles value={vibes.positions} onChange={positions => set({ positions })} />
          <HeightRange value={vibes.heights} onChange={heights => set({ heights })} /></div>
        <div className="config-block"><h3>Options</h3>
          <BreakerSettings value={vibes.breakers} onChange={breakers => set({ breakers })} />
          <label className="check"><input type="checkbox" checked={vibes.useFloors} onChange={e => set({ useFloors: e.target.checked })} />
            Enforce minimums for “good” and “elite” vibes</label></div>
        <div className="config-block grow"><h3>What this asks for</h3>
          <div className="weights">{attributes.filter(a => weights[a.index] > 0.5).sort((a, b) => weights[b.index] - weights[a.index])
            .map(a => <span key={a.name} className="chip">{name(a.name)} <b>×{weights[a.index].toFixed(1)}</b>
              {goals[a.index] > 25 && <small> ≥{goals[a.index]}</small>}</span>)}
            {!count && <p className="muted">Pick some vibes or type a description.</p>}</div></div>
      </div>
      <div className="run-row">
        <button className="primary big" disabled={!count || state.running} onClick={start}>{state.running ? 'Searching…' : 'Find my build'}</button>
        {state.running && <button onClick={cancel}>Cancel</button>}
        <button onClick={() => set(defaultVibes())}>Clear</button>
        <SearchStatus state={state} />
      </div>
    </section>
    <ResultsList results={state.result?.results} highlight={highlight} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />
  </div>;
}
