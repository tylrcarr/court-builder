import React, { useLayoutEffect, useState } from 'react';
import { attributes, feet, name, positions } from '../engine.js';
import { groups, tierLabel, tierShort } from '../derive.js';

export const label = key => key === 'hall_of_fame' ? 'Hall of Fame' : name(key);
export const SHORT = {
  close_shot: 'CLS', driving_layup: 'LAY', driving_dunk: 'DNK', standing_dunk: 'SDK', post_control: 'PST',
  mid_range: 'MID', three_point: '3PT', free_throw: 'FT', pass_accuracy: 'PAS', ball_handle: 'BH',
  speed_with_ball: 'SWB', interior_defense: 'IDF', perimeter_defense: 'PDF', steal: 'STL', block: 'BLK',
  offensive_rebound: 'ORB', defensive_rebound: 'DRB', speed: 'SPD', agility: 'AGL', strength: 'STR', vertical: 'VRT',
};
export const disciplineColour = d => ({ finishing: '#ff8a3d', shooting: '#4ade80', playmaking: '#38bdf8',
  defense: '#a78bfa', rebounding: '#f472b6', physicals: '#facc15', animation: '#f87171' })[d] ?? '#94a3b8';
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
  // Apply a valid value right away: Firefox's spinner arrows change the number without focusing the box, so it never
  // blurs and a blur-only commit would show the new number but never save it. Out-of-range drafts (typing "9" on the way
  // to "91") wait for blur/Enter, which clamps them.
  const edit = text => {
    setDraft(text);
    const n = Number(text);
    if (text !== '' && Number.isInteger(n) && n >= min && n <= max && n !== value && onChange(n) === false) setDraft(String(value));
  };
  return <input className={'num ' + className} aria-label={title} type="number" min={min} max={max} value={draft}
    onChange={e => edit(e.target.value)} onBlur={commit}
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

// breakers/base (optional): mark attributes raised by Cap Breakers with how much they add (+18), base → final on hover.
export function MiniRatings({ final, highlight = [], caps, breakers, base }) {
  return <div className="mini-ratings">{groups.map(g => <div key={g} className="mini-group">
    {attributes.filter(a => a.discipline === g).map(a => {
      const n = breakers?.[a.index] ?? 0;
      return <div key={a.name}
        className={'mini ' + ratingTone(final[a.index]) + (highlight.includes(a.index) ? ' hl' : '') + (n ? ' broke' : '')}
        title={`${name(a.name)} ${final[a.index]}${n && base ? ` (${base[a.index]} → ${final[a.index]}: +${final[a.index] - base[a.index]} from ${n} Cap Breaker${n > 1 ? 's' : ''})` : ''}${caps ? ' / cap ' + caps[a.index] : ''}`}>
        <span>{SHORT[a.name]}</span><b>{n > 0 && <i className="broke-n">{base ? `+${final[a.index] - base[a.index]}` : `↑${n}`}</i>}{final[a.index]}</b></div>;
    })}
  </div>)}</div>;
}

export function requirementText(badge, tier) {
  const t = badge.tiers.find(x => x.tier === tier);
  if (!t) return '';
  return t.requirements.map((r, i) => (i ? ` ${t.requirements[i - 1].operator_to_next} ` : '') +
    `${name(r.name)} ${r.minimum}`).join('') || 'No rating requirement';
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
