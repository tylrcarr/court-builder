import React, { useMemo, useState } from 'react';
import { assess, attributes, badgeTier, defaultBody, empty, feet, lowerLinkedRatings, name, positions, resolveLinks, tiers } from '../engine.js';
import { fill } from '../solver.js';
import { maximizeBadges, unlockTier } from '../tune.js';
import { capsFor } from '../engine.js';
import { derive, groups, nearBadges, zeros } from './derive.js';
import { Bar, NumberInput, Select, TierPill, disciplineColour, label, ratingTone, requirementText } from './common.jsx';
import { shareUrl } from '../share.js';

const choose = (values, i, v) => values.map((old, j) => j === i ? v : old);

export default function BuilderView({ build, setBuild, onSave, notify, library, undo, redo, onOptimize }) {
  const { body, base, breakers } = build;
  const d = useMemo(() => derive(build), [build]);
  const [locks, setLocks] = useState(() => attributes.map(() => false));
  const [showBreakers, setShowBreakers] = useState(true);
  const [title, setTitle] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const row = positions[body.position].find(r => r.height === body.height);
  const range = (lo, hi, fmt) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, fmt(lo + i)]);

  const canIncrease = useMemo(() => d.ratings.map((r, i) => r < d.caps[i] &&
    assess(resolveLinks(choose(base, i, r + 1), body.height), body.height, d.caps).fits), [d, base, body.height]);
  const plusCost = useMemo(() => d.ratings.map((r, i) => {
    if (r >= d.caps[i]) return null;
    const next = assess(resolveLinks(choose(base, i, r + 1), body.height), body.height, d.caps);
    return next.score - d.state.score;
  }), [d, base, body.height]);
  const room = canIncrease.some(Boolean);
  const shownOverall = Math.max(25, Math.min(room ? 98 : 99, room ? Math.floor(d.state.score + 1e-6) : 99));
  const near = useMemo(() => nearBadges(d.final, body.height, 8).slice(0, 10), [d.final, body.height]);

  function updateBody(next) {
    const caps = capsFor(next);
    let adjusted = resolveLinks(d.ratings, next.height);
    for (let i = 0; i < caps.length; i++)
      if (adjusted[i] > caps[i]) adjusted = resolveLinks(lowerLinkedRatings(adjusted, next.height, i, caps[i]), next.height);
    setBuild({ body: next, base: adjusted.map((v, i) => Math.min(v, caps[i])) });
    notify('Body updated. Ratings above the new caps were lowered.');
  }
  function changePosition(position) {
    const r = positions[position].find(o => o.height === body.height);
    if (r && body.weight >= r.minWeight && body.weight <= r.maxWeight && body.wingspan >= r.minWingspan && body.wingspan <= r.maxWingspan)
      return setBuild({ body: { ...body, position } });
    updateBody(defaultBody(position, positions[position].some(o => o.height === body.height) ? body.height : undefined));
  }
  function changeHeight(height) {
    const r = positions[body.position].find(o => o.height === height);
    updateBody({ ...body, height, weight: Math.max(r.minWeight, Math.min(r.maxWeight, body.weight)),
      wingspan: Math.max(r.minWingspan, Math.min(r.maxWingspan, body.wingspan)) });
  }
  function setRating(i, value) {
    if (d.ratings[i] === value) return true;
    let next = value < d.linkedFloors[i] ? lowerLinkedRatings(base, body.height, i, value) : choose(base, i, value);
    let trial = assess(resolveLinks(next, body.height), body.height, d.caps);
    const blocked = !trial.fits;
    while (!trial.fits && value > d.ratings[i]) {
      value--; next = choose(base, i, value);
      trial = assess(resolveLinks(next, body.height), body.height, d.caps);
    }
    const lowering = value < d.ratings[i] && trial.withinCaps;
    if ((trial.fits || lowering) && value !== d.ratings[i]) setBuild({ base: next });
    if (blocked) notify(`${name(attributes[i].name)} is limited by the 99 Overall budget.`);
    return !blocked;
  }
  function getBadge(n) {
    const result = unlockTier(build, n, locks);
    if (result.error) return notify(`Can't unlock ${label(n.badge.name)} ${label(n.tier)}: ${result.error}`);
    setBuild({ base: result.base });
    const traded = Object.entries(result.trimmed).map(([i, k]) => `${name(attributes[i].name)} −${k}`).join(', ');
    notify(`Unlocked ${label(n.badge.name)} ${label(n.tier)}${traded ? ' by trading ' + traded : ''}. Ctrl+Z to undo.`);
  }
  function maxBadges() {
    const before = d.badgePoints;
    const result = maximizeBadges(build, locks);
    if (!result.gained.length) return notify('No badge upgrades fit without losing something. Try unlocking attributes.');
    setBuild({ base: result.build.base });
    notify(`+${result.points - before} badge tier points: ${result.gained.map(g => label(g.split(' ')[0])).join(', ')}. Ctrl+Z to undo.`);
  }
  function autoFill(mode) {
    const weights = attributes.map((a, i) => locks[i] ? 0 : mode === 'even' ? 1 : Math.max(0.05, (d.ratings[i] - 25) / 74) ** 2);
    const plan = { manual: base, breakers: d.applied };
    const filled = fill(plan, weights, { body, h: body.height, caps: d.caps }, locks);
    setBuild({ base: filled.manual });
    notify(mode === 'even' ? 'Spread the remaining budget evenly.' : 'Filled the remaining budget toward your strengths.');
  }

  const exportText = [
    `${d.finalName ?? 'MyPLAYER build'} — ${body.position} ${feet(body.height)} ${body.weight} lb, ${feet(body.wingspan)} wingspan`,
    `Overall ${shownOverall} · Cap Breakers ${d.breakerCount} (${d.generalUsed}/${build.budget} general, ${d.specialUsed} specialized)`,
    ...groups.map(g => `${name(g)}: ` + attributes.filter(a => a.discipline === g)
      .map(a => `${name(a.name)} ${d.ratings[a.index]}${d.final[a.index] > d.ratings[a.index] ? '→' + d.final[a.index] : ''}`).join(', ')),
    `Badges (${d.unlocked.length}): ` + d.unlocked.map(u => `${label(u.badge.name)} ${label(u.tier)}`).join(', '),
  ].join('\n');

  return <div className="builder">
    <section className="card body-card">
      <div className="body-fields">
        <Select title="Position" value={body.position} options={Object.keys(positions).map(p => [p, p])} onChange={changePosition} />
        <Select stepper title="Height" value={body.height} options={positions[body.position].map(r => [r.height, feet(r.height)])}
          onChange={h => changeHeight(Number(h))} />
        <Select stepper title="Weight" value={body.weight} options={range(row.minWeight, row.maxWeight, v => v + ' lb')}
          onChange={w => updateBody({ ...body, weight: Number(w) })} />
        <Select stepper title="Wingspan" value={body.wingspan} options={range(row.minWingspan, row.maxWingspan, feet)}
          onChange={w => updateBody({ ...body, wingspan: Number(w) })} />
      </div>
      <div className="ovr-block" aria-label={`${shownOverall} Overall`}>
        <span>OVR</span><strong className={shownOverall >= 99 ? 'full' : ''}>{shownOverall}</strong>
        <div className="ovr-meter"><i style={{ width: (Math.min(99, d.state.score) - 25) / 74 * 100 + '%' }} /></div>
        <small>{room ? `${(99 - d.state.score).toFixed(1)} OVR left to spend` : 'Filled to 99'}</small>
      </div>
    </section>

    <div className="builder-grid">
      <section className="card attributes-card">
        <div className="card-head">
          <div><h2>Attributes</h2><p className="muted">Linked ratings move together. Lock an attribute to protect it from auto-fill.</p></div>
          <div className="actions">
            <button onClick={undo} disabled={!undo} title="Undo (Ctrl+Z)">↶</button>
            <button onClick={redo} disabled={!redo} title="Redo (Ctrl+Y)">↷</button>
            <button onClick={() => autoFill('strengths')} disabled={!room} title="Spend the remaining budget toward your highest ratings">Auto-fill strengths</button>
            <button onClick={() => autoFill('even')} disabled={!room}>Auto-fill evenly</button>
            <button aria-pressed={showBreakers} onClick={() => setShowBreakers(!showBreakers)}>{showBreakers ? 'Hide' : 'Show'} breakers</button>
            <button onClick={() => { setBuild({ base: empty(), breakers: zeros() }); notify('Build reset to 25s.'); }}>Reset</button>
          </div>
        </div>
        {groups.map(g => <div key={g} className="attr-group">
          <h3 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h3>
          {attributes.filter(a => a.discipline === g).map(({ index: i, name: key }) => <div key={key}
            className={'attr-row' + (showBreakers ? ' with-breakers' : '') + (locks[i] ? ' locked' : '')}>
            <div className="attr-name">
              <button className={'lock' + (locks[i] ? ' on' : '')} aria-pressed={locks[i]} title={locks[i] ? 'Unlock' : 'Lock for auto-fill'}
                onClick={() => setLocks(choose(locks, i, !locks[i]))}>{locks[i] ? '🔒' : '🔓'}</button>
              <span>{name(key)}</span>
              {d.linkedFloors[i] > 25 && <small title="Linked minimum from other attributes">min {d.linkedFloors[i]}</small>}
            </div>
            <div className="attr-control">
              <button className="step" aria-label={`Decrease ${name(key)}`} disabled={d.ratings[i] <= 25} onClick={() => setRating(i, d.ratings[i] - 1)}>−</button>
              <input type="range" aria-label={`${name(key)} slider`} min={25} max={d.caps[i]} value={d.ratings[i]} disabled={d.caps[i] === 25}
                style={{ '--fill': (d.ratings[i] - 25) / Math.max(1, d.caps[i] - 25) * 100 + '%', '--accent': disciplineColour(g) }}
                onChange={e => setRating(i, Number(e.target.value))} />
              <button className="step" aria-label={`Increase ${name(key)}`} disabled={!canIncrease[i]} onClick={() => setRating(i, d.ratings[i] + 1)}
                title={plusCost[i] != null ? `+1 costs ${plusCost[i].toFixed(2)} OVR` : 'At cap'}>+</button>
              <NumberInput title={`${name(key)} rating`} value={d.ratings[i]} max={d.caps[i]} onChange={v => setRating(i, v)} />
            </div>
            {showBreakers && <div className="breakers" role="group" aria-label={`${name(key)} Cap Breakers`}>
              {d.ladders[i].map((gain, step) => <button key={step} disabled={!gain}
                className={step < d.applied[i] ? 'on' : ''} aria-pressed={step < d.applied[i]}
                title={gain ? `Breaker ${step + 1}: +${gain}` : 'No gain left'}
                onClick={() => setBuild({ breakers: choose(breakers, i, d.applied[i] === step + 1 ? 0 : step + 1) })}>
                {gain ? '+' + gain : '·'}</button>)}
            </div>}
            <div className="attr-final">
              <strong className={ratingTone(d.final[i]) + (d.final[i] > d.ratings[i] ? ' boosted' : '')}>{d.final[i]}</strong>
              <small title="Body cap">/{d.caps[i]}</small>
            </div>
          </div>)}
        </div>)}
      </section>

      <aside className="side">
        <section className="card name-card">
          <span className="eyebrow">{d.breakerCount ? 'Name after Cap Breakers' : 'Build name'}</span>
          <h2>{d.finalName ?? 'Unnamed build'}</h2>
          {d.breakerCount > 0 && d.name !== d.finalName && <small className="muted">Base: {d.name}</small>}
          <div className="name-stats"><span><b>{d.unlocked.length}</b> badges</span><span><b>{d.badgePoints}</b> tier pts</span>
            <span className={d.overBudget ? 'warn' : ''}><b>{d.generalUsed}/{build.budget}</b> breakers</span></div>
        </section>
        <section className="card">
          <h3>Cap Breaker pool</h3>
          <div className="pool">
            <label className="field compact"><span>General</span><NumberInput title="General breakers" value={build.budget} min={0} max={105}
              onChange={v => setBuild({ budget: v })} /></label>
            <Select compact title="Specialization" value={build.category}
              options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => setBuild({ category: v })} />
            {build.category && <label className="field compact"><span>Specialized</span><NumberInput title="Specialized breakers"
              value={build.specialCount} min={0} max={30} onChange={v => setBuild({ specialCount: v })} /></label>}
          </div>
          {d.overBudget && <p className="warn small">Using more general breakers than your pool.</p>}
        </section>
        <section className="card">
          <div className="row-head"><h3>Badges unlocked <span className="count">{d.unlocked.length}</span></h3>
            <button className="mini-btn" onClick={maxBadges} title="Trade budget for more badge tiers without losing any">Maximize</button></div>
          <div className="unlocked">{tiers.slice().reverse().map(t => {
            const list = d.unlocked.filter(u => u.tier === t);
            return list.length ? <div key={t} className="tier-group"><TierPill tier={t} />
              {list.map(u => <span key={u.badge.badge} className="chip" title={requirementText(u.badge, u.tier)}>{label(u.badge.name)}</span>)}</div> : null;
          })}{!d.unlocked.length && <p className="muted">Raise ratings to unlock badges.</p>}</div>
        </section>
        {near.length > 0 && <section className="card">
          <h3>Within reach</h3>
          <ul className="near">{near.map(n => <li key={n.badge.badge}>
            <span>{label(n.badge.name)} <TierPill tier={n.tier} small />
              <button className="mini-btn" onClick={() => getBadge(n)} title="Raise the needed attributes">Get it</button></span>
            <small>{n.gaps.map(g => `${name(g.name)} +${g.gap}`).join(', ')}</small></li>)}</ul>
        </section>}
        <button className="optimize" onClick={() => onOptimize(body)}>Optimize this body in the Lab →</button>
        <section className="card">
          <h3>Save & share</h3>
          <input type="text" placeholder="Build title (optional)" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
          <div className="actions wrap">
            <button className="primary" onClick={() => { onSave({ ...build, title: title.trim() || `${d.finalName ?? 'Build'} · ${body.position} ${feet(body.height)}` }); setTitle(''); }}>Save build</button>
            <button onClick={async () => { const url = shareUrl({ ...build, title }); try { await navigator.clipboard.writeText(url); notify('Share link copied.'); } catch { prompt('Copy this link', url); } }}>Copy share link</button>
            <button aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>Export text</button>
          </div>
          {exportOpen && <textarea readOnly rows={9} value={exportText} onFocus={e => e.target.select()} />}
          <p className="muted small">{library.length} saved build{library.length === 1 ? '' : 's'}.</p>
        </section>
      </aside>
    </div>
  </div>;
}
