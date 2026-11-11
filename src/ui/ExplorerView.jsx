import React, { useMemo, useState } from 'react';
import { attributes, capsFor, defaultBody, feet, name, positions } from '../engine.js';
import { SHORT, Select, disciplineColour } from './common.jsx';

const heat = v => `hsl(${Math.max(0, Math.min(130, (v - 25) / 74 * 130))} 70% ${v >= 99 ? 42 : 32}%)`;

// How body choices move attribute caps.
export default function ExplorerView({ build, onUseBody }) {
  const [position, setPosition] = useState(build.body.position);
  const [frame, setFrame] = useState('mid');
  const [height, setHeight] = useState(build.body.height);
  const rows = useMemo(() => positions[position].map(r => {
    const mid = defaultBody(position, r.height);
    const body = frame === 'min' ? { ...mid, weight: r.minWeight, wingspan: r.minWingspan }
      : frame === 'max' ? { ...mid, weight: r.maxWeight, wingspan: r.maxWingspan } : mid;
    return { body, caps: capsFor(body) };
  }), [position, frame]);
  const row = positions[position].find(r => r.height === height) ?? positions[position][0];
  const sweep = useMemo(() => {
    const mid = defaultBody(position, row.height);
    const w = [row.minWeight, mid.weight, row.maxWeight].map(weight => ({ label: weight + ' lb', caps: capsFor({ ...mid, weight }) }));
    const s = [row.minWingspan, mid.wingspan, row.maxWingspan].map(wingspan => ({ label: feet(wingspan) + ' WS', caps: capsFor({ ...mid, wingspan }) }));
    return { w, s };
  }, [position, row]);

  return <div className="explorer">
    <section className="card">
      <div className="card-head"><div><h2>Caps explorer</h2>
        <p className="muted">Attribute caps for every height, using 2K's cap formula: 25 + 74 × height × weight × wingspan multipliers.
          Position only limits which bodies are legal.</p></div>
        <div className="actions">
          <Select compact title="Position" value={position} options={Object.keys(positions).map(p => [p, p])} onChange={setPosition} />
          <Select compact title="Frame" value={frame} options={[['min', 'Light & short arms'], ['mid', 'Default'], ['max', 'Heavy & long arms']]} onChange={setFrame} />
        </div></div>
      <div className="heat-wrap"><table className="heat">
        <thead><tr><th>Height</th>{attributes.map(a => <th key={a.name} title={name(a.name)} style={{ color: disciplineColour(a.discipline) }}>{SHORT[a.name]}</th>)}<th /></tr></thead>
        <tbody>{rows.map(({ body, caps }) => <tr key={body.height} className={body.height === height ? 'sel' : ''} onClick={() => setHeight(body.height)}>
          <th>{feet(body.height)}<small>{body.weight} lb · {feet(body.wingspan)}</small></th>
          {caps.map((c, i) => <td key={i} style={{ background: heat(c) }}>{c}</td>)}
          <td><button onClick={e => { e.stopPropagation(); onUseBody(body); }}>Use</button></td></tr>)}</tbody>
      </table></div>
    </section>
    <section className="card">
      <h3>Weight & wingspan at {feet(row.height)} ({position})</h3>
      <div className="heat-wrap"><table className="heat">
        <thead><tr><th />{attributes.map(a => <th key={a.name} title={name(a.name)}>{SHORT[a.name]}</th>)}</tr></thead>
        <tbody>{[...sweep.w, ...sweep.s].map((r, k) => <tr key={k}><th>{r.label}</th>
          {r.caps.map((c, i) => <td key={i} style={{ background: heat(c) }}>{c}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="muted small">Rows vary one thing at a time from the default frame, so you can see which caps weight and arm length trade.</p>
    </section>
  </div>;
}
