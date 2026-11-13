import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { attributes, feet, name, positions, tiers } from '../engine.js';
import { groups, tierLabel, tierShort } from '../derive.js';
import { archetypeInfo } from '../archetypes.js';

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
  const order = Object.keys(positions); // PG, SG, SF, PF, C
  const list = [...new Set([body.position, ...also])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return <span className="bodyline"><b>{list.join('/')}</b> · {feet(body.height)} · {body.weight} lb · {feet(body.wingspan)} WS</span>;
}

// breakers/base (optional): mark attributes raised by Cap Breakers with how much they add (+18), base → final on hover.
// onPick (optional): clicking a rating calls onPick(attributeIndex) — result cards open its Cap Breaker chart row.
export function MiniRatings({ final, highlight = [], caps, breakers, base, onPick, picked = null }) {
  return <div className="mini-ratings">{groups.map(g => <div key={g} className="mini-group">
    {attributes.filter(a => a.discipline === g).map(a => {
      const n = breakers?.[a.index] ?? 0;
      const Tag = onPick ? 'button' : 'div';
      return <Tag key={a.name} {...(onPick ? { type: 'button', onClick: () => onPick(a.index) } : {})}
        className={'mini ' + ratingTone(final[a.index]) + (highlight.includes(a.index) ? ' hl' : '') + (n ? ' broke' : '')
          + (onPick ? ' pickable' : '') + (picked === a.index ? ' picked' : '')}
        title={`${name(a.name)} ${final[a.index]}${n && base ? ` (${base[a.index]} → ${final[a.index]}: +${final[a.index] - base[a.index]} from ${n} Cap Breaker${n > 1 ? 's' : ''})` : ''}${caps ? ' / cap ' + caps[a.index] : ''}${onPick ? ' · click for its Cap Breaker steps' : ''}`}>
        <span>{SHORT[a.name]}</span><b>{n > 0 && <i className="broke-n">{base ? `+${final[a.index] - base[a.index]}` : `↑${n}`}</i>}{final[a.index]}</b></Tag>;
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

// A dialog over everything (rendered into <body>, so no card or sticky bar can sit on top of it). Esc or a click outside closes.
export function Modal({ title, onClose, children, actions, wide = false }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="row-head modal-head"><h3>{title}</h3>
        <div className="actions">{actions}<button className="mini-btn" aria-label="Close" onClick={onClose}>✕</button></div></div>
      {children}
    </div></div>, document.body);
}

// Archetype name with a "?" that explains it: what it weighs most (costly, small Cap Breaker steps) and least (cheap,
// big steps). height/type: the build's height and player type.
export function Archetype({ height, type, prefix = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const info = archetypeInfo(height, type);
  if (!info) return null;
  const hover = useRef(null);
  const show = () => { clearTimeout(hover.current); setOpen(true); };
  const hide = () => { clearTimeout(hover.current); hover.current = setTimeout(() => setOpen(false), 150); };
  return <span className="arch" ref={ref} onMouseEnter={show} onMouseLeave={hide}>{prefix}<b title={info.name}>{info.name}</b>
    <button type="button" className="arch-q" aria-expanded={open} aria-label={`What is ${info.name}?`} onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>?</button>
    {open && <span className="arch-pop" role="tooltip">
      <b>{info.name}</b> <small className="muted">archetype #{type + 1} of 15 at {feet(height)}</small>
      <span>The game picks your archetype from your base ratings. It decides how much each rating costs in Overall and how far
        each Cap Breaker goes.</span>
      <span><em>Built around</em> (costly, small breaker steps): {info.heavy.map(n => name(n)).join(', ')}</span>
      <span><em>Cheap here</em> (big breaker steps): {info.light.map(n => name(n)).join(', ')}</span>
    </span>}
  </span>;
}

// A quick build card for comparing options: every rating with a green ▲ / red ▼ against the build you have, plus badge
// tiers gained and lost. d / from: derived builds (see derive).
export function QuickCard({ d, from: base, title, blurb, stats, onApply, applyLabel = 'Use this', children, disabled }) {
  const tierOf = x => new Map(x.unlocked.map(u => [u.badge.name, u.tier]));
  const now = tierOf(base), next = tierOf(d);
  const rank = t => tiers.indexOf(t);
  const gained = [...next].filter(([k, t]) => rank(t) > rank(now.get(k)));
  const lost = [...now].filter(([k, t]) => rank(next.get(k)) < rank(t));
  const changed = d.final.some((v, i) => v !== base.final[i]);
  return <article className="quick-card">
    <div className="row-head"><div><b>{title}</b>{blurb && <span className="muted small"> {blurb}</span>}</div>
      <div className="actions">{stats}{onApply && <button className="primary mini-btn" disabled={disabled ?? !changed} onClick={onApply}>{applyLabel}</button>}</div></div>
    <div className="qc-meta muted small">{d.finalName ?? 'Unnamed'} · <Archetype height={d.height} type={d.state.playerType} /> · {d.unlocked.length} badges
      {d.unlocked.length !== base.unlocked.length && <b className={d.unlocked.length > base.unlocked.length ? 'good-text' : 'bad-text'}> ({d.unlocked.length > base.unlocked.length ? '+' : ''}{d.unlocked.length - base.unlocked.length})</b>}
      {' '}· {d.breakerCount} breakers</div>
    <div className="qc-grid">{groups.map(g => <div key={g} className="qc-group">
      <h5 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h5>
      {attributes.filter(a => a.discipline === g).map(a => {
        const v = d.final[a.index], x = v - base.final[a.index];
        return <div key={a.name} className={'qc-row' + (x > 0 ? ' up' : x < 0 ? ' down' : '')} title={`${name(a.name)} ${base.final[a.index]} → ${v}`}>
          <span>{SHORT[a.name]}</span><b className={ratingTone(v)}>{v}</b>
          <i>{x > 0 ? `▲${x}` : x < 0 ? `▼${-x}` : ''}</i></div>;
      })}</div>)}</div>
    {(gained.length > 0 || lost.length > 0) && <div className="chips qc-badges">
      {gained.map(([k, t]) => <span key={k} className="chip up">▲ {label(k)} {tierShort(t)}</span>)}
      {lost.map(([k, t]) => <span key={k} className="chip down">▼ {label(k)} {next.get(k) ? `${tierShort(t)}→${tierShort(next.get(k))}` : tierShort(t)}</span>)}</div>}
    {children}
  </article>;
}
