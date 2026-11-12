import React, { useMemo, useState } from 'react';
import { name } from '../engine.js';
import { SIZE_NAMES, TAKEOVER_SLOTS, animationStatus, freeAnimationGroups, minimumsFor, requirementLabel, sizeFamily, takeoverGap,
  takeovers } from '../unlocks.js';
import { disciplineColour } from './common.jsx';

const gapText = gap => gap === Infinity ? 'above cap' : `+${gap}`;

// "Lab min" button: adds the ratings that unlock something to the Lab's minimums (final ratings).
function useRequire(d, setPrefs, notify) {
  return (thing) => {
    const mins = minimumsFor(thing.reqs, thing.or, d.final, d.caps);
    if (!mins.length) return notify(`${thing.name} isn't reachable on this body.`);
    setPrefs(p => ({ ...p, minimums: { ...p.minimums, ...Object.fromEntries(mins.map(([k, v]) => [k, Math.max(v, p.minimums?.[k] ?? 0)])) } }));
    notify(`Lab minimums: ${mins.map(([k, v]) => `${name(k)} ${v}`).join(', ')} (for ${thing.name}).`);
  };
}

export function TakeoverPanel({ d, setPrefs, notify }) {
  const require = useRequire(d, setPrefs, notify);
  return <section className="card takeovers">
    <div className="row-head"><h3>Takeovers</h3>
      <span className="muted small">One per slot, fires when that meter maxes out. Every slot also has its Default (+30 to the slot's ratings, up to 80);
        Hydration Hero fits any slot.</span></div>
    <div className="to-grid">{TAKEOVER_SLOTS.map(slot => <div key={slot} className="to-slot">
      <h4 style={{ '--accent': disciplineColour(slot) }}>{name(slot)}</h4>
      {takeovers.filter(t => t.slot === slot).map(t => {
        const gap = takeoverGap(t, d.final, d.caps);
        return <div key={t.name} className={'to-row' + (gap === 0 ? ' on' : '')} title={`${t.does}\nNeeds ${requirementLabel(t, name)}`}>
          <span>{gap === 0 ? '✓ ' : ''}{t.name}</span>
          {gap > 0 && <small className={gap === Infinity ? 'muted' : ''}>{gapText(gap)}</small>}
          {gap > 0 && gap !== Infinity && <button className="mini-btn" title="Add its ratings to the Lab's minimums" onClick={() => require(t)}>Lab</button>}
        </div>;
      })}
    </div>)}</div>
  </section>;
}

export function AnimationPanel({ d, height, setPrefs, notify }) {
  const require = useRequire(d, setPrefs, notify);
  const status = useMemo(() => animationStatus(d.final, height, d.caps), [d.final, d.caps, height]);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const q = query.trim().toLowerCase();
  const family = sizeFamily(height);

  const item = a => <li key={a.name + a.reqs.join()} className={a.gap === 0 ? 'on' : ''} title={requirementLabel(a, name)}>
    <span>{a.name}{a.prized ? ' ★' : ''}{a.season ? ` (Season ${a.season})` : ''}</span>
    <small>{a.gap === 0 ? requirementLabel(a, name) : `${gapText(a.gap)} · ${requirementLabel(a, name)}`}</small>
    {a.gap > 0 && a.gap !== Infinity && <button className="mini-btn" title="Add its ratings to the Lab's minimums" onClick={() => require(a)}>Lab</button>}
  </li>;

  return <section className="card animations">
    <div className="row-head"><h3>Animations <span className="muted small">{SIZE_NAMES[family]} at this height</span></h3>
      <div className="bp-stats">
        <input type="search" placeholder="Find an animation…" value={query} onChange={e => setQuery(e.target.value)} />
        {!q && <div className="toggles">{status.map((t, k) => <button key={t.name} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setOpen(null); }}>
          {t.name} <small>{t.groups.reduce((s, g) => s + g.unlocked.length, 0)}/{t.groups.reduce((s, g) => s + g.total, 0)}</small></button>)}</div>}
      </div></div>
    {q ? <ul className="an-list">{status.flatMap(t => t.groups.flatMap(g => [...g.unlocked, ...g.locked]
      .filter(a => a.name.toLowerCase().includes(q)).map(a => ({ ...a, group: g.name }))))
      .slice(0, 60).map(a => item({ ...a, name: `${a.name} — ${a.group}` }))}</ul>
      : <div className="an-groups">{status[tab].groups.map(g => {
        const next = g.locked.find(a => a.gap !== Infinity);
        return <div key={g.name} className={'an-group' + (open === g.name ? ' open' : '')}>
          <button className="an-head" onClick={() => setOpen(open === g.name ? null : g.name)} aria-expanded={open === g.name}>
            <b>{g.name}</b>
            <span className="an-count">{g.unlocked.length}/{g.total}</span>
            <small className="muted">{next ? `next: ${next.name} (${gapText(next.gap)})` : g.locked.length ? 'rest above your caps' : 'all unlocked'}</small>
          </button>
          {open === g.name && <ul className="an-list">{[...g.locked.filter(a => a.gap !== Infinity).slice(0, 15), ...g.unlocked].map(item)}
            {g.locked.some(a => a.gap === Infinity) && <li className="muted small">{g.locked.filter(a => a.gap === Infinity).length} more need ratings above this body's caps.</li>}
            {g.otherSizes > 0 && <li className="muted small">{g.otherSizes} more are for other heights.</li>}</ul>}
        </div>;
      })}</div>}
    <p className="muted small bp-note">From NBA 2K HQ's animation glossary. Always available (no requirements): {freeAnimationGroups.map(([n, c]) => `${n} (${c})`).join(', ')}.
      "Lab" adds the ratings an unlock needs to your Lab minimums.</p>
  </section>;
}
