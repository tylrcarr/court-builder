import React, { useMemo, useState } from 'react';
import { attributes, feet, name, playerTypeCount, typeWeights } from '../engine.js';
import { archetypesAt } from '../archetypes.js';
import { derive } from '../derive.js';
import { allAnimations, groupsOf, searchAnimations, sizesText, wantKey } from '../anim-wants.js';
import { AnimationProfiles } from './AnimProfiles.jsx';
import { animationGap, animationTabs, requirementLabel, sizeFamily, SIZE_NAMES } from '../unlocks.js';
import { Archetype, SHORT, disciplineColour } from './common.jsx';

// Every archetype at a height: its name, what it's built around, and a heat map of how much each rating counts toward
// Overall (darker = costs more, smaller Cap Breaker steps).
export function ArchetypesView({ build }) {
  const [height, setHeight] = useState(build.body.height);
  const d = useMemo(() => derive(build), [build]);
  const list = archetypesAt(height);
  const cols = attributes.filter(a => a.name !== 'free_throw');
  const all = Array.from({ length: playerTypeCount(height) }, (_, t) => typeWeights(height, t));
  const top = Math.max(...all.flatMap(w => cols.map(a => w[a.index])));
  return <section className="card">
    <div className="card-head"><div><h2>Archetypes</h2>
      <p className="muted">The game gives every build one of 15 archetypes at its height, picked from your base ratings (before Cap Breakers). The archetype
        sets how much each rating costs in Overall and how far each Cap Breaker goes: ratings it weighs heavily are expensive and get small breaker
        steps, light ones are cheap and get big steps. Names describe the playstyle each one is built around.</p></div>
      <label className="field compact"><span>Height</span><select value={height} onChange={e => setHeight(Number(e.target.value))}>
        {Array.from({ length: 20 }, (_, i) => 69 + i).map(h => <option key={h} value={h}>{feet(h)}</option>)}</select></label></div>
    <div className="arch-table" role="table">
      <div className="arch-row head" role="row"><span>Archetype</span>{cols.map(a => <span key={a.name} title={name(a.name)}
        style={{ color: disciplineColour(a.discipline) }}>{SHORT[a.name]}</span>)}</div>
      {list.map(x => <div key={x.type} role="row" className={'arch-row' + (height === build.body.height && x.type === d.state.playerType ? ' mine' : '')}>
        <span className="arch-name"><small className="muted">#{x.type + 1}</small> <Archetype height={height} type={x.type} />
          {height === build.body.height && x.type === d.state.playerType && <span className="chip">yours</span>}</span>
        {cols.map(a => { const w = all[x.type][a.index];
          return <span key={a.name} className="heat" title={`${name(a.name)}: weight ${w.toFixed(2)}`}
            style={{ background: `rgba(255, 138, 61, ${Math.min(1, w / top) * 0.85})` }}>{w.toFixed(1)}</span>; })}
      </div>)}
    </div>
    <p className="muted small">Numbers: how much each rating point counts toward Overall in that archetype (free throw is the same everywhere).
      Balanced archetypes weigh everything the same.</p>
  </section>;
}

// The whole animation glossary, searchable: what each needs, whether your build has it, and a "Want" toggle that makes it a
// Lab requirement.
export function AnimationsView({ build, prefs, setPrefs, notify }) {
  const d = useMemo(() => derive(build), [build]);
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState(sizeFamily(build.body.height));
  const [tab, setTab] = useState('');
  const [group, setGroup] = useState('');
  const wants = (prefs.wantAnims ?? []).map(wantKey);
  const q = query.trim();
  const list = useMemo(() => (q ? searchAnimations(q, { family: family || null, limit: 300 })
    : allAnimations.filter(a => !family || a.sizes === 'A' || a.sizes.includes(family)))
    .filter(a => (!tab || a.tab === tab) && (!group || a.group === group)).slice(0, 300), [q, family, tab, group]);
  const toggle = a => setPrefs(p => {
    const has = (p.wantAnims ?? []).some(k => wantKey(k) === a.key);
    notify(has ? `Removed ${a.name} (${a.group}) from Lab requirements.` : `Lab requirement: ${a.name} (${a.group}).`);
    return { ...p, wantAnims: has ? p.wantAnims.filter(k => wantKey(k) !== a.key) : [...(p.wantAnims ?? []), a.key] };
  });
  return <section className="card">
    <div className="card-head"><div><h2>Animations</h2>
      <p className="muted">NBA 2K HQ's animation glossary: jumpers, dribble styles, layups, dunks, defense and more, with the ratings each one needs.
        <b> Want</b> makes it a Lab requirement (the Lab only shows builds that unlock it). Your build: {feet(build.body.height)} = {SIZE_NAMES[sizeFamily(build.body.height)].toLowerCase()}.</p></div>
      <div className="head-stats"><span><b>{wants.length}</b> wanted</span></div></div>
    <div className="picker-tools labelled">
      <label className="field compact grow"><span>Search</span><input type="search" placeholder="Player, animation or type (e.g. “curry jump shot”, “sigs”)…"
        value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="field compact"><span>Sizes</span><select value={family} onChange={e => setFamily(e.target.value)}>
        <option value="">Any size</option>{Object.entries(SIZE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="field compact"><span>Type</span><select value={tab} onChange={e => { setTab(e.target.value); setGroup(''); }}>
        <option value="">All types</option>{animationTabs.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></label>
      <label className="field compact"><span>Group</span><select value={group} onChange={e => setGroup(e.target.value)}>
        <option value="">All groups</option>{groupsOf(tab).map(g => <option key={g} value={g}>{g}</option>)}</select></label>
    </div>
    <AnimationProfiles prefs={prefs} setPrefs={setPrefs} notify={notify} />
    <div className="anim-table" role="table">
      <div className="anim-row head" role="row"><span>Animation</span><span>Group</span><span>Sizes</span><span>Needs</span><span>Yours</span><span /></div>
      {list.map(a => { const gap = animationGap(a, d.final, d.caps), on = wants.includes(a.key);
        return <div key={a.key} role="row" className={'anim-row' + (on ? ' on' : '')}>
          <span><b>{a.name}</b>{a.prized ? ' ★' : ''}</span><span className="muted">{a.group}</span><span className="muted small">{sizesText(a.sizes)}</span>
          <span className="small">{requirementLabel(a, name)}</span>
          <span className={gap === 0 ? 'good-text small' : 'muted small'}>{gap === 0 ? '✓ unlocked' : gap === Infinity ? 'above caps' : `+${gap}`}</span>
          <button className={'mini-btn' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(a)}>{on ? '✓ Wanted' : 'Want'}</button></div>; })}
      {!list.length && <p className="muted small" style={{ padding: 12 }}>No animations match.</p>}
    </div>
    {list.length >= 300 && <p className="muted small">Showing the first 300: search to narrow it down.</p>}
  </section>;
}
