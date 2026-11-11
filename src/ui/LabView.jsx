import React from 'react';
import { attributes, badges, name } from '../engine.js';
import { groups } from './derive.js';
import { BadgePicker, BreakerSettings, HeightRange, NumberInput, PositionToggles, ResultsList, SearchStatus,
  SHORT, disciplineColour, useSearch } from './common.jsx';

const idx = Object.fromEntries(attributes.map(a => [a.name, a.index]));
export const defaultLab = () => ({
  positions: [], heights: [69, 88], thorough: false, badgeGoals: {}, goals: attributes.map(() => 25),
  stars: attributes.map(() => 1), breakers: { general: 8, special: { category: '', count: 0 } }, limit: 12,
});

const PRESETS = [
  { label: 'Stretch big', positions: ['PF', 'C'], heights: [80, 86], stars: { three_point: 3, defensive_rebound: 3, block: 2, interior_defense: 2, offensive_rebound: 1 } },
  { label: '3&D wing', positions: ['SG', 'SF'], heights: [76, 81], stars: { three_point: 3, perimeter_defense: 3, steal: 2, agility: 2, speed: 1 } },
  { label: 'Slashing guard', positions: ['PG', 'SG'], heights: [73, 78], stars: { driving_layup: 3, driving_dunk: 3, ball_handle: 2, speed_with_ball: 2, speed: 2, vertical: 1 } },
  { label: 'Playmaking sharpshooter', positions: ['PG', 'SG'], heights: [72, 78], stars: { three_point: 3, mid_range: 2, pass_accuracy: 3, ball_handle: 3, speed_with_ball: 2 } },
  { label: 'Paint beast', positions: ['C'], heights: [82, 88], stars: { standing_dunk: 3, close_shot: 2, post_control: 2, block: 3, defensive_rebound: 3, strength: 2 } },
  { label: 'Two-way slasher', positions: ['SF', 'PF'], heights: [78, 82], stars: { driving_dunk: 3, driving_layup: 2, perimeter_defense: 3, steal: 2, vertical: 2 } },
];

export const starsToWeights = stars => stars.map(s => [0, 0.15, 1, 2.2, 4][s] ?? 1);

export default function LabView({ lab, setLab, onOpen, onCompare, onSave }) {
  const [state, run, cancel] = useSearch();
  const set = patch => setLab(l => ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) }));
  const chosen = Object.entries(lab.badgeGoals).filter(([, t]) => t).map(([b, tier]) => ({ badge: Number(b), tier }));
  const highlight = lab.stars.map((s, i) => s >= 3 ? i : -1).filter(i => i >= 0);

  function start() {
    run({ positions: lab.positions, heights: lab.heights, thorough: lab.thorough, goals: lab.goals,
      badgeGoals: chosen, weights: starsToWeights(lab.stars), breakers: lab.breakers, limit: lab.limit });
  }
  function applyPreset(p) {
    const stars = attributes.map(a => p.stars[a.name] ?? 1);
    set({ positions: p.positions, heights: p.heights, stars });
  }

  return <div className="lab">
    <section className="card lab-config">
      <div className="card-head"><div><h2>Build Lab</h2>
        <p className="muted">Pick badges and priorities. The solver tries every legal body, satisfies the requirements with the
          fewest Overall points (using Cap Breakers where they save the most), then fills to 99 toward your priorities.</p></div></div>
      <div className="presets"><span>Start from:</span>{PRESETS.map(p => <button key={p.label} onClick={() => applyPreset(p)}>{p.label}</button>)}</div>
      <div className="config-grid">
        <div className="config-block">
          <h3>Body</h3>
          <PositionToggles value={lab.positions} onChange={positions => set({ positions })} />
          <p className="muted small">{lab.positions.length ? '' : 'No position selected = all positions.'}</p>
          <HeightRange value={lab.heights} onChange={heights => set({ heights })} />
          <label className="check"><input type="checkbox" checked={lab.thorough} onChange={e => set({ thorough: e.target.checked })} />
            Thorough (more weight & wingspan options per height)</label>
          <h3>Cap Breakers</h3>
          <BreakerSettings value={lab.breakers} onChange={breakers => set({ breakers })} />
        </div>
        <div className="config-block grow">
          <h3>Badges <span className="count">{chosen.length}</span></h3>
          <BadgePicker value={lab.badgeGoals} heightRange={lab.heights} onChange={next => set(l => ({ badgeGoals: typeof next === 'function' ? next(l.badgeGoals) : next }))} />
        </div>
      </div>
      <details className="config-details" open>
        <summary>Priorities & minimums</summary>
        <p className="muted small">Stars decide where leftover budget goes (0 = ignore). Minimums are final ratings after Cap Breakers.</p>
        <div className="prio-grid">{groups.map(g => <div key={g} className="prio-group">
          <h4 style={{ color: disciplineColour(g) }}>{name(g)}</h4>
          {attributes.filter(a => a.discipline === g).map(a => <div key={a.name} className="prio-row">
            <span title={name(a.name)}>{name(a.name)}</span>
            <div className="stars" role="radiogroup" aria-label={`${name(a.name)} priority`}>{[0, 1, 2, 3, 4].map(s =>
              <button key={s} className={lab.stars[a.index] >= s && s > 0 ? 'on' : s === 0 && lab.stars[a.index] === 0 ? 'zero' : ''}
                aria-label={`${s} stars`} onClick={() => set(l => ({ stars: l.stars.map((v, i) => i === a.index ? s : v) }))}>{s === 0 ? '∅' : '★'}</button>)}</div>
            <NumberInput title={`${name(a.name)} minimum`} className={lab.goals[a.index] > 25 ? 'set' : ''} value={lab.goals[a.index]}
              onChange={v => set(l => ({ goals: l.goals.map((g2, i) => i === a.index ? v : g2) }))} />
          </div>)}
        </div>)}</div>
        <div className="actions"><button onClick={() => set({ goals: attributes.map(() => 25) })}>Clear minimums</button>
          <button onClick={() => set({ stars: attributes.map(() => 1) })}>Reset stars</button></div>
      </details>
      <div className="run-row">
        <button className="primary big" disabled={state.running} onClick={start}>{state.running ? 'Searching…' : 'Find builds'}</button>
        {state.running && <button onClick={cancel}>Cancel</button>}
        <label className="field compact"><span>Results</span><NumberInput title="Result count" value={lab.limit} min={3} max={40}
          onChange={limit => set({ limit })} /></label>
        <SearchStatus state={state} />
      </div>
    </section>
    <ResultsList results={state.result?.results} highlight={highlight} requested={chosen} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />
  </div>;
}

export { SHORT, idx };
