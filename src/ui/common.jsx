import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { attributes, badges, feet, name, positions, tiers } from '../engine.js';
import { derive, groups, tierLabel, tierShort } from './derive.js';

export const label = key => key === 'hall_of_fame' ? 'Hall of Fame' : name(key);
export const SHORT = {
  close_shot: 'CLS', driving_layup: 'LAY', driving_dunk: 'DNK', standing_dunk: 'SDK', post_control: 'PST',
  mid_range: 'MID', three_point: '3PT', free_throw: 'FT', pass_accuracy: 'PAS', ball_handle: 'BH',
  speed_with_ball: 'SWB', interior_defense: 'IDF', perimeter_defense: 'PDF', steal: 'STL', block: 'BLK',
  offensive_rebound: 'ORB', defensive_rebound: 'DRB', speed: 'SPD', agility: 'AGL', strength: 'STR', vertical: 'VRT',
};
export const disciplineColour = d => ({ finishing: '#ff8a3d', shooting: '#4ade80', playmaking: '#38bdf8',
  defense: '#a78bfa', rebounding: '#f472b6', physicals: '#facc15' })[d] ?? '#94a3b8';
export const ratingTone = v => v >= 90 ? 'elite' : v >= 80 ? 'great' : v >= 70 ? 'good' : v >= 55 ? 'ok' : 'low';

export function Select({ title, value, options, onChange, stepper = false, compact = false }) {
  const at = options.findIndex(([k]) => String(k) === String(value));
  return <label className={compact ? 'field compact' : 'field'}><span>{title}</span>
    <div className={stepper ? 'stepper' : 'plain'}>
      {stepper && <button type="button" aria-label={'Decrease ' + title} disabled={at <= 0}
        onClick={() => onChange(String(options[at - 1][0]))}>−</button>}
      <select aria-label={title} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([k, text]) => <option key={k} value={k}>{text}</option>)}
      </select>
      {stepper && <button type="button" aria-label={'Increase ' + title} disabled={at >= options.length - 1}
        onClick={() => onChange(String(options[at + 1][0]))}>+</button>}
    </div></label>;
}

export function NumberInput({ title, value, min = 25, max = 99, onChange, className = '' }) {
  const [draft, setDraft] = useState(String(value));
  useLayoutEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.max(min, Math.min(max, Math.trunc(Number(draft)) || 0));
    const ok = onChange(draft === '' ? value : n);
    setDraft(String(ok === false ? value : draft === '' ? value : n));
  };
  return <input className={'num ' + className} aria-label={title} type="number" min={min} max={max} value={draft}
    onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

export function Bar({ value, cap = 99, ghost, colour }) {
  return <div className="bar" aria-hidden="true">
    {ghost != null && ghost > value && <i className="ghost" style={{ width: (ghost - 25) / 74 * 100 + '%' }} />}
    <i className={'fill ' + ratingTone(value)} style={{ width: (value - 25) / 74 * 100 + '%', background: colour }} />
    <b className="capmark" style={{ left: (cap - 25) / 74 * 100 + '%' }} />
  </div>;
}

export function TierPill({ tier, small }) {
  return <span className={`tier ${tier ?? 'none'}${small ? ' small' : ''}`}>{small ? tierShort(tier) : tierLabel(tier)}</span>;
}

export function BodyLine({ body, also = [] }) {
  return <span className="bodyline"><b>{[body.position, ...also].join('/')}</b> · {feet(body.height)} · {body.weight} lb · {feet(body.wingspan)} WS</span>;
}

export function MiniRatings({ final, highlight = [], caps }) {
  return <div className="mini-ratings">{groups.map(g => <div key={g} className="mini-group">
    {attributes.filter(a => a.discipline === g).map(a => <div key={a.name}
      className={'mini ' + ratingTone(final[a.index]) + (highlight.includes(a.index) ? ' hl' : '')}
      title={`${name(a.name)} ${final[a.index]}${caps ? ' / cap ' + caps[a.index] : ''}`}>
      <span>{SHORT[a.name]}</span><b>{final[a.index]}</b></div>)}
  </div>)}</div>;
}

// A search result or saved build, rendered as a card.
export function ResultCard({ result, rank, highlight = [], requested = [], onOpen, onCompare, onSave, extra }) {
  const d = useMemo(() => derive({ body: result.body, base: result.manual ?? result.base, breakers: result.breakers }),
    [result]);
  const met = requested.map(r => ({ ...r, got: d.unlocked.find(u => u.badge.badge === r.badge)?.tier }));
  return <article className="result">
    <header>
      <div className="rank">{rank}</div>
      <div><h3>{d.finalName ?? 'Unnamed build'}</h3><BodyLine body={result.body} also={result.alsoPositions} /></div>
      <div className="result-stats">
        <span title="Badge tiers unlocked">{d.unlocked.length}<small>badges</small></span>
        <span title="Cap Breakers in this plan">{d.breakerCount}<small>breakers</small></span>
        {result.similarity != null && <span title="Similarity">{Math.round(result.similarity * 100)}%<small>match</small></span>}
      </div>
    </header>
    <MiniRatings final={d.final} highlight={highlight} caps={d.caps} />
    {met.length > 0 && <div className="met">{met.map(m => <span key={m.badge}
      className={tiers.indexOf(m.got) >= tiers.indexOf(m.tier) ? 'ok' : 'miss'}>
      {label(badges.find(b => b.badge === m.badge).name)} <TierPill tier={m.got} small /></span>)}</div>}
    {extra}
    <footer>
      {onOpen && <button className="primary" onClick={() => onOpen(result)}>Open in Builder</button>}
      {onCompare && <button onClick={() => onCompare(result)}>Compare</button>}
      {onSave && <button onClick={() => onSave(result)}>Save</button>}
    </footer>
  </article>;
}

// Badge picker: search + discipline filter + per-badge tier selector.
export function BadgePicker({ value, onChange, heightRange }) {
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const shown = badges.filter(b => (!discipline || b.discipline === discipline) &&
    (!query || b.name.replaceAll('_', ' ').includes(query.toLowerCase())));
  const set = (badge, tier) => onChange(v => ({ ...v, [badge]: v[badge] === tier ? undefined : tier }));
  const disciplines = [...new Set(badges.map(b => b.discipline))];
  const count = Object.values(value).filter(Boolean).length;
  return <div className="badge-picker">
    <div className="picker-tools">
      <input type="search" placeholder="Search badges…" value={query} onChange={e => setQuery(e.target.value)} />
      <select value={discipline} onChange={e => setDiscipline(e.target.value)} aria-label="Badge category">
        <option value="">All categories</option>{disciplines.map(d => <option key={d} value={d}>{name(d)}</option>)}
      </select>
      {count > 0 && <button onClick={() => onChange({})}>Clear {count}</button>}
    </div>
    <div className="picker-list">{shown.map(b => {
      const outOfRange = heightRange && (b.height_inches[1] < heightRange[0] || b.height_inches[0] > heightRange[1]);
      return <div key={b.badge} className={'pick-row' + (value[b.badge] ? ' on' : '') + (outOfRange ? ' dim' : '')}>
        <div className="pick-name"><i style={{ background: disciplineColour(b.discipline) }} />{label(b.name)}
          <small>{feet(b.height_inches[0])}–{feet(b.height_inches[1])}</small></div>
        <div className="tier-buttons">{tiers.map(t => <button key={t} className={'tb ' + t + (value[b.badge] === t ? ' on' : '')}
          title={requirementText(b, t)} onClick={() => set(b.badge, t)}>{tierShort(t)}</button>)}</div>
      </div>;
    })}</div>
  </div>;
}

export function requirementText(badge, tier) {
  const t = badge.tiers.find(x => x.tier === tier);
  if (!t) return '';
  return t.requirements.map((r, i) => (i ? ` ${t.requirements[i - 1].operator_to_next} ` : '') +
    `${name(r.name)} ${r.minimum}`).join('') || 'No rating requirement';
}

// Runs searches in a worker. Returns [state, run, cancel].
export function useSearch() {
  const worker = useRef(null);
  const [state, setState] = useState({ running: false });
  const cancel = () => { worker.current?.terminate(); worker.current = null; setState(s => ({ ...s, running: false })); };
  useEffect(() => cancel, []);
  const run = options => {
    cancel();
    const w = new Worker(new URL('../lab-worker.js', import.meta.url), { type: 'module' });
    worker.current = w;
    const started = performance.now();
    setState({ running: true, progress: null });
    w.onmessage = ({ data }) => {
      if (data.progress) return setState(s => ({ ...s, progress: data.progress }));
      setState({ running: false, error: data.error, result: data.result, ms: Math.round(performance.now() - started) });
      w.terminate(); worker.current = null;
    };
    w.onerror = () => setState({ running: false, error: 'The search could not finish.' });
    w.postMessage({ id: 1, options });
  };
  return [state, run, cancel];
}

export function SearchStatus({ state, noun = 'builds' }) {
  if (state.running) return <p className="status-line"><span className="spinner" />Searching bodies…
    {state.progress && ` ${state.progress.done}/${state.progress.total}`}</p>;
  if (state.error) return <p className="status-line warn">{state.error}</p>;
  if (state.result) return <p className="status-line">Checked {state.result.frames.toLocaleString()} bodies
    ({state.result.feasible.toLocaleString()} could meet the requirements) in {state.ms} ms.
    {!state.result.results.length && ` No ${noun} fit — loosen the requirements or allow more Cap Breakers.`}</p>;
  return null;
}

export function PositionToggles({ value, onChange }) {
  return <div className="toggles" role="group" aria-label="Positions">{Object.keys(positions).map(p =>
    <button key={p} className={value.includes(p) ? 'on' : ''} aria-pressed={value.includes(p)}
      onClick={() => onChange(value.includes(p) ? value.filter(x => x !== p) : [...value, p])}>{p}</button>)}</div>;
}

export function HeightRange({ value, onChange }) {
  const opts = Array.from({ length: 88 - 69 + 1 }, (_, i) => [69 + i, feet(69 + i)]);
  return <div className="range-pair">
    <Select compact title="Min height" value={value[0]} options={opts}
      onChange={v => onChange([Number(v), Math.max(Number(v), value[1])])} />
    <Select compact title="Max height" value={value[1]} options={opts}
      onChange={v => onChange([Math.min(value[0], Number(v)), Number(v)])} />
  </div>;
}

export function BreakerSettings({ value, onChange }) {
  return <div className="breaker-settings">
    <label className="field compact"><span>Cap Breakers</span>
      <NumberInput title="Cap Breakers" value={value.general} min={0} max={60}
        onChange={v => onChange({ ...value, general: v })} /></label>
    <Select compact title="Specialization" value={value.special.category}
      options={[['', 'None'], ...groups.map(g => [g, name(g)])]}
      onChange={v => onChange({ ...value, special: { ...value.special, category: v } })} />
    {value.special.category && <label className="field compact"><span>Specialized</span>
      <NumberInput title="Specialized breakers" value={value.special.count} min={0} max={30}
        onChange={v => onChange({ ...value, special: { ...value.special, count: v } })} /></label>}
  </div>;
}

// Sorting/filtering toolbar + grid for search results, shared by Lab, Vibes and Similar.
export function ResultsList({ results = [], highlight, requested, onOpen, onCompare, onSave }) {
  const [sort, setSort] = useState('fit');
  const [filter, setFilter] = useState('');
  const enriched = useMemo(() => results.map((r, i) => {
    const d = derive({ body: r.body, base: r.manual ?? r.base, breakers: r.breakers });
    return { r, i, name: d.finalName ?? '', badges: d.unlocked.length, breakers: d.breakerCount };
  }), [results]);
  if (!results.length) return null;
  const q = filter.trim().toLowerCase();
  const shown = enriched.filter(x => !q || x.name.toLowerCase().includes(q) || feet(x.r.body.height).includes(q)
    || [x.r.body.position, ...(x.r.alsoPositions ?? [])].some(p => p.toLowerCase() === q))
    .sort((a, b) => sort === 'badges' ? b.badges - a.badges || a.i - b.i : sort === 'breakers' ? a.breakers - b.breakers || a.i - b.i
      : sort === 'height' ? a.r.body.height - b.r.body.height || a.i - b.i : a.i - b.i);
  return <>
    <div className="results-bar">
      <span className="muted">{shown.length} of {results.length} results</span>
      <input type="search" placeholder="Filter by name, height (6'8) or position…" value={filter} onChange={e => setFilter(e.target.value)} />
      <Select compact title="Sort by" value={sort} onChange={setSort}
        options={[['fit', 'Best fit'], ['badges', 'Most badges'], ['breakers', 'Fewest breakers'], ['height', 'Height']]} />
    </div>
    <div className="results">{shown.map(x => <ResultCard key={x.i} rank={x.i + 1} result={x.r} highlight={highlight}
      requested={requested} onOpen={onOpen} onCompare={onCompare} onSave={onSave} />)}</div>
  </>;
}
