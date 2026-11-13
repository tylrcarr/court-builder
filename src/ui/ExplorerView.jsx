import React, { useMemo, useState } from 'react';
import { attributes, capsFor, defaultBody, feet, name, positions } from '../engine.js';
import { SHORT, Select, disciplineColour } from './common.jsx';

const heat = v => `hsl(${Math.max(0, Math.min(130, (v - 25) / 74 * 130))} 70% ${v >= 99 ? 42 : 32}%)`;
const ARMS = [['min', 'Shortest arms'], ['default', 'Default arms'], ['max', 'Longest arms']];

// Body caps: pick a rating and see how high it can go for every height × weight (at the arm length you choose). Click a
// cell for that body's caps on every rating, and use it in the Builder.
export default function ExplorerView({ build, onUseBody }) {
  const [position, setPosition] = useState(build.body.position);
  const [attr, setAttr] = useState('three_point');
  const [arms, setArms] = useState('default');
  const [pick, setPick] = useState(null); // body
  const ai = attributes.findIndex(a => a.name === attr);
  const rows = positions[position];
  const step = 5;
  const lo = Math.min(...rows.map(r => r.minWeight)), hi = Math.max(...rows.map(r => r.maxWeight));
  const weights = Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, k) => lo + k * step);
  const bodyAt = (r, weight) => {
    const mid = defaultBody(position, r.height);
    const wingspan = arms === 'min' ? r.minWingspan : arms === 'max' ? r.maxWingspan : Math.max(r.minWingspan, Math.min(r.maxWingspan, mid.wingspan));
    return { position, height: r.height, weight, wingspan };
  };
  const grid = useMemo(() => rows.map(r => ({ r, cells: weights.map(w => w < r.minWeight || w > r.maxWeight ? null
    : (() => { const body = bodyAt(r, w); return { body, cap: capsFor(body)[ai] }; })()) })), [position, attr, arms]);
  const best = Math.max(...grid.flatMap(g => g.cells.filter(Boolean).map(c => c.cap)));
  const caps = pick ? capsFor(pick) : null;
  const mine = build.body;
  return <div className="explorer">
    <section className="card">
      <div className="card-head"><div><h2>Body caps</h2>
        <p className="muted">How high can a rating go on each body? Pick a rating: every cell is its cap at that height (rows) and weight (columns).
          Brighter = higher. Click a cell to see that body's caps on every rating and use it. Caps follow 2K's formula: 25 + 74 × height × weight ×
          wingspan multipliers; position only limits which bodies are legal.</p></div></div>
      <div className="picker-tools labelled">
        <Select compact title="Position" value={position} options={Object.keys(positions).map(p => [p, p])} onChange={p => { setPosition(p); setPick(null); }} />
        <label className="field compact"><span>Rating</span><select value={attr} onChange={e => setAttr(e.target.value)}>
          {attributes.map(a => <option key={a.name} value={a.name}>{name(a.name)}</option>)}</select></label>
        <Select compact title="Wingspan" value={arms} options={ARMS} onChange={setArms} />
        <span className="muted small">Highest {name(attr)} cap here: <b>{best}</b></span>
      </div>
      <div className="heat-wrap"><table className="heat cap-grid">
        <thead><tr><th>Height \ lb</th>{weights.map(w => <th key={w}>{w}</th>)}</tr></thead>
        <tbody>{grid.map(({ r, cells }) => <tr key={r.height}>
          <th>{feet(r.height)}</th>
          {cells.map((c, k) => !c ? <td key={k} className="na" />
            : <td key={k} style={{ background: heat(c.cap) }} title={`${feet(c.body.height)} ${c.body.weight} lb ${feet(c.body.wingspan)} arms: ${name(attr)} cap ${c.cap}`}
              className={(c.cap === best ? 'top ' : '') + (pick && pick.height === c.body.height && pick.weight === c.body.weight ? 'sel ' : '')
                + (mine.height === c.body.height && Math.abs(mine.weight - c.body.weight) < step && mine.position === position ? 'mine' : '')}
              onClick={() => setPick(c.body)}>{c.cap}</td>)}
        </tr>)}</tbody>
      </table></div>
      <p className="muted small">Columns step by {step} lb · outlined = your current body · ★ = the highest cap for this rating.</p>
    </section>
    {pick && <section className="card">
      <div className="row-head"><h3>{position} · {feet(pick.height)} · {pick.weight} lb · {feet(pick.wingspan)} wingspan</h3>
        <button className="primary" onClick={() => onUseBody(pick)}>Use this body in the Builder</button></div>
      <div className="cap-chips">{attributes.map((a, i) => <span key={a.name} className={'cap-chip' + (a.name === attr ? ' on' : '')}
        style={{ '--accent': disciplineColour(a.discipline) }} title={name(a.name)}>
        <small>{SHORT[a.name]}</small><b style={{ color: heat(caps[i]).replace('32%', '62%').replace('42%', '62%') }}>{caps[i]}</b>
        {mine.position === position && <i className={caps[i] > capsFor(mine)[i] ? 'up' : caps[i] < capsFor(mine)[i] ? 'down' : ''}>
          {caps[i] !== capsFor(mine)[i] ? (caps[i] > capsFor(mine)[i] ? '▲' : '▼') + Math.abs(caps[i] - capsFor(mine)[i]) : ''}</i>}</span>)}</div>
      {mine.position === position && <p className="muted small">▲/▼: compared with your current body ({feet(mine.height)}, {mine.weight} lb, {feet(mine.wingspan)}).</p>}
    </section>}
  </div>;
}
