import React, { useEffect, useMemo, useState } from 'react';
import { assess, attributes, badgeTier, defaultBody, empty, feet, lowerLinkedRatings, name, positions, resolveLinks, tiers } from '../engine.js';
import { maximizeBadges, trimDeadWeight, unlockTier } from '../tune.js';
import { BASE_CEILING, DEFAULT_CONTINUOUS, SPECIALIZATIONS, autoFeel, byName, deadWeight, feelFor, goals, heldTiers, nextBreakpoint, objective, valueOf } from '../breakpoints.js';
import { META_OPTION, PlanCard, TemplateCard, optimizerOptions, pickOptions, useOptimize, usePool } from './LabView.jsx';
import { VARIANTS as DIRECTIONS } from '../variants.js';
import { capsFor } from '../engine.js';
import { derive, groups, nearBadges, tierShort, zeros } from './derive.js';
import { Bar, NumberInput, Select, TierPill, disciplineColour, label, ratingTone, requirementText } from './common.jsx';
import { shareUrl } from '../share.js';

const choose = (values, i, v) => values.map((old, j) => j === i ? v : old);

export default function BuilderView({ build, setBuild, onSave, notify, library, undo, redo, onSendToLab, prefs, setPrefs, labCfg }) {
  const { body, base, breakers } = build;
  const d = useMemo(() => derive(build), [build]);
  const [locks, setLocks] = useState(() => attributes.map(() => false));
  const [showBreakers, setShowBreakers] = useState(true);
  const [title, setTitle] = useState(build.title ?? '');
  useEffect(() => setTitle(build.title ?? ''), [build.savedId, build.title]);
  const saved = build.savedId && library.some(x => x.id === build.savedId);
  const saveAs = savedId => {
    const t = title.trim() || `${d.finalName ?? 'Build'} · ${body.position} ${feet(body.height)}`;
    const id = onSave({ ...build, title: t, savedId });
    setBuild({ title: t, savedId: id });
  };
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
  const near = useMemo(() => nearBadges(d.final, body.height, 8, d.caps).slice(0, 10), [d.final, body.height]);
  // Feel attributes for this build: the user's list plus automatic ones (bigs: boards; dunkers: handle + speed with ball).
  // With a blank Lab (nothing valued yet), the Builder treats every badge as Normal and uses the standard feel list.
  const effective = useMemo(() => ({ ...(goals.some(g => valueOf(prefs, g) > 0) ? prefs
    : { ...prefs, values: { ...prefs.values, '*': 1 }, continuous: prefs.continuous.length ? prefs.continuous : DEFAULT_CONTINUOUS }),
    position: body.position }), [prefs, body.position]);
  const feel = useMemo(() => feelFor(effective, body.position, d.final), [effective, body.position, d.final]);
  const auto = useMemo(() => new Set(autoFeel(body.position, d.final)), [body.position, d.final]);
  const buildPrefs = useMemo(() => ({ ...effective, continuous: feel }), [effective, feel]);
  const dw = useMemo(() => deadWeight(d.final, body.height, buildPrefs, build.category, d.ratings), [d, buildPrefs, build.category]);
  const nexts = useMemo(() => attributes.map((_, i) => nextBreakpoint(i, d.final, body.height, effective, build.category,
    attributes.map((a, j) => Math.min(d.caps[j], effective.maximums?.[a.name] ?? 99)))),
    [d.final, body.height, effective, build.category]);
  // Base ratings above 94 that Cap Breakers could carry instead (94 + five +1s = 99), with the Overall it would free.
  const highBase = useMemo(() => d.ratings.map((r, i) => {
    if (r <= BASE_CEILING || d.applied[i] >= 5) return null;
    const lowered = assess(resolveLinks(lowerLinkedRatings(base, body.height, i, BASE_CEILING), body.height), body.height, d.caps);
    return { i, rating: r, saves: d.state.score - lowered.score };
  }).filter(Boolean), [d, base, body.height]);
  // Slack measured against the higher of the badge floor and the linked minimum (links can't be undercut alone).
  // Attributes carrying Cap Breakers are deliberate investments, so they never count as dead.
  const slack = useMemo(() => dw.slack.map((x, i) => d.applied[i] > 0 ? 0 : Math.max(0, Math.min(x, d.final[i] - d.linkedFloors[i]))), [dw, d]);
  const deadPoints = slack.reduce((s, x) => s + x, 0);
  const isFeel = i => feel.includes(attributes[i].name);
  const toggleFeel = i => {
    const key = attributes[i].name;
    setPrefs(p => isFeel(i)
      ? { ...p, continuous: p.continuous.filter(k => k !== key), notFeel: auto.has(key) ? [...new Set([...(p.notFeel ?? []), key])] : p.notFeel }
      : { ...p, continuous: [...p.continuous, key], notFeel: (p.notFeel ?? []).filter(k => k !== key) });
  };
  const spec = SPECIALIZATIONS[build.category];

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
  function trim() {
    const result = trimDeadWeight(build, effective, locks);
    if (result.freed < 0.01 && !result.changes.length) return notify('Already on breakpoints — nothing to trim.');
    setBuild({ base: result.base });
    notify(`Freed ${result.freed.toFixed(1)} OVR from dead points: ${result.changes.map(([k, x]) => `${name(k)} ${x > 0 ? '+' : ''}${x}`).join(', ')}. Ctrl+Z to undo.`);
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
          <div><h2>Attributes</h2><p className="muted">Linked ratings move together. <b className="dead-text">+n</b> = points above the last breakpoint you
          care about; <b>→n</b> = next breakpoint. ↑ marks a feel attribute (worth raising on its own).</p></div>
          <div className="actions">
            <button onClick={undo} disabled={!undo} title="Undo (Ctrl+Z)">↶</button>
            <button onClick={redo} disabled={!redo} title="Redo (Ctrl+Y)">↷</button>
            <button aria-pressed={showBreakers} onClick={() => setShowBreakers(!showBreakers)}>{showBreakers ? 'Hide' : 'Show'} breakers</button>
            <button onClick={() => { setBuild({ base: empty(), breakers: zeros() }); notify('Build reset to 25s.'); }}>Reset</button>
          </div>
        </div>
        {groups.map(g => <div key={g} className="attr-group">
          <h3 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h3>
          {attributes.filter(a => a.discipline === g).map(({ index: i, name: key }) => <div key={key}
            className={'attr-row' + (showBreakers ? ' with-breakers' : '') + (locks[i] ? ' locked' : '')}>
            <div className="attr-name">
              <button className={'lock' + (locks[i] ? ' on' : '')} aria-pressed={locks[i]} title={locks[i] ? 'Unlock' : 'Lock: trim and Get it won’t change this'}
                onClick={() => setLocks(choose(locks, i, !locks[i]))}>{locks[i] ? '🔒' : '🔓'}</button>
              <button className={'feel' + (isFeel(i) ? ' on' : '')} aria-pressed={isFeel(i)}
                title={(isFeel(i) ? 'Feel attribute: worth raising past breakpoints' + (auto.has(key) && !prefs.continuous.includes(key)
                  ? ' (automatic: you have a driving dunk)' : '')
                  + '. Click to treat as breakpoint-only.' : 'Mark as a feel attribute')}
                onClick={() => toggleFeel(i)}>↑</button>
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
              {slack[i] > 0 && <small className="dead" title={`${slack[i]} point${slack[i] > 1 ? 's' : ''} above the last breakpoint you care about (${Math.max(dw.floors[i], d.linkedFloors[i])})`
                + (!nexts[i] || nexts[i].rating > d.caps[i] ? ` — and no valued breakpoint is reachable under this body's cap of ${d.caps[i]}. Mark it ↑ if it matters for feel.` : '')}>+{slack[i]}</small>}
              {nexts[i] && nexts[i].rating <= d.caps[i] && <small className="next" title={'At ' + nexts[i].rating + ': ' + nexts[i].unlocks.map(u => u.specialization
                ? `${name(u.specialization)} specialization` : `${label(u.badge.name)} ${label(u.tier)}${u.alone ? '' : ' (with other ratings)'}`).join(', ')}>→{nexts[i].rating}</small>}
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
              options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => setBuild({ category: v, specialCount: v ? 2 : 0 })} />
          </div>
          {d.overBudget && <p className="warn small">Using more general breakers than your pool.</p>}
          {build.category && !d.specOk && <p className="warn small">{name(build.category)} specialization is locked: needs {Object.entries(spec?.minimums ?? {})
            .map(([k, v]) => `${name(k)} ${v}`).join(' and ')} base. Specialized breakers count as general until then.</p>}
        </section>
        <section className="card">
          <div className="row-head"><h3>Breakpoints</h3>
            <button className="mini-btn" onClick={trim} disabled={!deadPoints} title="Lower ratings to their last breakpoint and reinvest in feel attributes">Trim dead points</button></div>
          {deadPoints ? <p className="small"><b className="dead-text">{deadPoints}</b> rating points sit above the last breakpoint you care about:{' '}
            {attributes.map((a, i) => slack[i] ? `${name(a.name)} +${slack[i]}` : null).filter(Boolean).join(', ')}.</p>
            : <p className="muted small">Every non-feel rating sits on a breakpoint.</p>}
          {highBase.length > 0 && <p className="small warn">Base above 94: {highBase.map(h => `${name(attributes[h.i].name)} ${h.rating} (94 frees ${h.saves.toFixed(1)} OVR)`)
            .join(', ')}. Cap Breakers are the cheaper way up there.</p>}
          <button className="optimize" onClick={() => onSendToLab(build)}>Send to Build Lab →</button>
        </section>
        <TradeOffs build={build} d={d} prefs={buildPrefs} setBuild={setBuild} notify={notify} />
        <Alternatives build={build} d={d} prefs={buildPrefs} setBuild={setBuild} notify={notify} />
        <Recommender build={build} prefs={prefs} labCfg={labCfg} setBuild={setBuild} onSave={onSave} notify={notify} />
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
        <section className="card">
          <h3>Save & share</h3>
          <input type="text" placeholder="Build title (optional)" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
          <div className="actions wrap">
            <button className="primary" onClick={() => saveAs(saved ? build.savedId : null)}>{saved ? 'Save changes' : 'Save build'}</button>
            {saved && <button onClick={() => saveAs(null)}>Save as new</button>}
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

// "What if I drop a badge a tier?" for the build on screen: re-optimizes this body with every other valued tier kept.
function TradeOffs({ build, d, prefs, setBuild, notify }) {
  const [state, run, cancel] = useOptimize();
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs]);
  const [ranFor, setRanFor] = useState(null);
  const stale = ranFor !== key;
  const goalName = n => byName[n]?.label ?? label(n);
  const tierText = (g, t) => byName[g]?.tiers.length > 1 ? (t ? tierShort(t) : 'none') : (t ? '✓' : 'none');
  function price() {
    const opts = optimizerOptions(prefs, { breakers: { general: build.budget, future: 0, special: { category: build.category } }, mustHave: {} });
    const plan = { body: build.body, manual: build.base, base: d.ratings, breakers: d.applied, final: d.final,
      value: objective(d.final, build.body.height, opts), category: build.category };
    setRanFor(key);
    run('tradeoffs', { plan, opts });
  }
  const apply = (p, what) => { setBuild({ base: p.manual, breakers: p.breakers }); notify(`${what}. Ctrl+Z to undo.`); };
  // "Give up Elite contact dunks (keep Pro)", "Give up Dimer HoF → Gold", "Give up Pogo Stick".
  const giveUp = o => {
    const keepsPro = o.drop === 'elite_contact_off_two' && !o.lost.some(g => g.badge === 'pro_contact_off_two');
    const multi = byName[o.drop]?.tiers.length > 1;
    return <>Give up <b>{goalName(o.drop)}</b>{multi && <> {tierShort(o.from)}{o.to ? ` → ${tierShort(o.to)}` : ' entirely'}</>}
      {keepsPro && ' (keep Pro)'}</>;
  };
  const r = !stale && state.result;
  return <section className="card">
    <div className="row-head"><h3>Trade-offs</h3>
      {state.running ? <button className="mini-btn" onClick={cancel}>Cancel</button>
        : <button className="mini-btn" onClick={price}>{r ? 'Re-check' : 'Find trade-offs'}</button>}</div>
    {!r && !state.running && <p className="muted small">What would dropping one badge a tier buy on this body? Uses your Lab importance settings.</p>}
    {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
      {state.progress && ` ${state.progress.done}/${state.progress.total}`}</p>}
    {r && <>
      {r.improved && <p className="small">Same badges, better arrangement on this body (+{(r.improved.value - objective(d.final, build.body.height,
        optimizerOptions(prefs, { breakers: { special: { category: build.category } }, mustHave: {} }))).toFixed(1)}).{' '}
        <button className="mini-btn" onClick={() => apply(r.improved, 'Rearranged with the same badges')}>Apply</button></p>}
      {!r.offers.length && <p className="muted small">No one-tier drop buys anything worth more here.</p>}
      <ul className="offers">{r.offers.map(o => <li key={o.drop}>
        <span>{giveUp(o)}</span>
        <small>{[...o.gained.map(g => `+${goalName(g.badge)} ${tierText(g.badge, g.to)}`),
          ...o.lost.map(g => `−${goalName(g.badge)} ${tierText(g.badge, g.to)}`),
          o.physical ? `feel ${o.physical > 0 ? '+' : ''}${o.physical}` : ''].filter(Boolean).join(' · ')}{' '}
          <b className={o.net > 0 ? 'good-text' : 'muted'}>{o.net > 0 ? '+' : ''}{o.net.toFixed(1)}</b></small>
        <button className="mini-btn" onClick={() => apply(o.plan, `Dropped ${goalName(o.drop)} a tier`)}>Apply</button>
      </li>)}</ul>
    </>}
  </section>;
}

// Same build idea, nearby bodies: re-optimizes ±2 inches (several weight/wingspan frames each) with a variant goal.
const VARIANTS = [
  ['same', 'Same badges', 'Keep every badge tier you have; find a body that gets them cheaper and spends the rest better.'],
  ['playmaking', 'Better playmaking', 'Keep your core badges; playmaking badges count double, handle/speed with ball count as feel.'],
  ['physicals', 'Better physicals', 'Keep your core badges; speed, agility and vertical count extra.'],
];
function variantPrefs(prefs, variant) {
  if (variant === 'playmaking') {
    const values = { ...prefs.values };
    for (const g of goals) if (g.discipline === 'playmaking') values[g.name] = Math.max(1, valueOf(prefs, g)) * 2;
    return { ...prefs, values, continuous: [...new Set([...prefs.continuous, 'ball_handle', 'speed_with_ball'])],
      continuousWeights: { ...prefs.continuousWeights, ball_handle: 2, speed_with_ball: 2 } };
  }
  if (variant === 'physicals') {
    const cw = { ...prefs.continuousWeights };
    for (const k of ['speed', 'agility', 'vertical']) cw[k] = (prefs.continuous.includes(k) ? cw[k] ?? 1 : 0) + 2;
    return { ...prefs, continuous: [...new Set([...prefs.continuous, 'speed', 'agility', 'vertical'])], continuousWeights: cw };
  }
  return prefs;
}
// Same body, different builds: a requirements-only template (your Lab musts, minimums and specialization from base
// ratings), the Meta build, and each direction (faster, more dunking, better shooting…) that noticeably changes it.
function Recommender({ build, prefs, labCfg, setBuild, onSave, notify }) {
  const pool = usePool();
  const [state, setState] = useState({ running: false });
  const key = JSON.stringify([build.body, build.budget, build.category, prefs, labCfg?.mustHave, labCfg?.mode]);
  const fresh = state.key === key;
  async function run() {
    pool.cancel();
    const mine = pool.token.current;
    const opts = optimizerOptions(prefs, { ...labCfg, from: null,
      breakers: { general: build.budget, future: 0, special: { category: build.category } } });
    setState({ running: true, key, progress: null });
    const jobs = [opts, ...DIRECTIONS.map(v => ({ ...v.apply(opts), archetypes: false, seeds: 0 }))].map(o => ({ kind: 'body', options: { body: build.body, opts: o } }));
    const out = await pool.runJobs(jobs, (done, total) => mine === pool.token.current && setState(s => ({ ...s, progress: { done, total } })));
    if (mine !== pool.token.current) return;
    const [meta, ...rest] = out;
    if (!meta || meta.error) return setState({ running: false, key, error: meta?.error ?? 'The optimizer could not finish.' });
    setState({ running: false, key, meta, options: pickOptions(meta, rest) });
  }
  const use = p => { setBuild({ base: p.manual, breakers: p.breakers }); notify('Applied to this body. Ctrl+Z to undo.'); };
  const mode = labCfg?.mode ?? 'both';
  return <section className="card recommender">
    <div className="row-head"><h3>Options for this body</h3>
      {state.running ? <button className="mini-btn" onClick={() => { pool.cancel(); setState(s => ({ ...s, running: false })); }}>Cancel</button>
        : <button className="mini-btn" onClick={run}>{fresh && state.meta ? 'Run again' : 'Recommend'}</button>}</div>
    <p className="muted small">Same height, weight and wingspan. Uses your Build Lab picks, musts and minimums; with none set, it's the
      meta for this body.</p>
    {state.running && <p className="status-line"><span className="spinner" />Building options…
      {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''}</p>}
    {state.error && <p className="status-line warn">{state.error}</p>}
    {fresh && state.meta && <div className="results recommend-grid">
      <TemplateCard plan={state.meta} prefs={prefs} mustHave={labCfg?.mustHave} onOpen={use} openLabel="Use this" />
      <PlanCard plan={state.meta} prefs={prefs} mode={mode} variant={META_OPTION} onOpen={use} onSave={onSave} openLabel="Use this" />
      {state.options.map(r => <PlanCard key={r.variant.id} plan={r} variant={r.variant} compareTo={state.meta} prefs={prefs} mode={mode}
        onOpen={use} onSave={onSave} openLabel="Use this" />)}
    </div>}
    {fresh && state.meta && !state.options.length && <p className="muted small">No other direction changes this body noticeably.</p>}
    {!fresh && state.meta && <p className="muted small">The body or your Lab picks changed — Recommend again.</p>}
  </section>;
}

function Alternatives({ build, d, prefs, setBuild, notify }) {
  const [state, run, cancel] = useOptimize();
  const [variant, setVariant] = useState('same');
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs, variant]);
  const [ranFor, setRanFor] = useState(null);
  const h = build.body.height;
  const nowHeld = useMemo(() => heldTiers(d.final, h, prefs), [d.final, h, prefs]);
  const goalName = n => byName[n]?.label ?? label(n);
  function search() {
    const vp = variantPrefs(prefs, variant);
    const mustHave = {};
    for (const [k, r] of nowHeld) if (variant === 'same' || valueOf(prefs, byName[k]) >= 3) mustHave[k] = tiers[r - 1];
    const opts = optimizerOptions(vp, { breakers: { general: build.budget, future: 0, special: { category: build.category } }, mustHave });
    setRanFor(key);
    run('across', { positions: [build.body.position], heights: [Math.max(69, h - 2), Math.min(88, h + 2)], thorough: false,
      around: build.body, opts: { ...opts, archetypes: false, seeds: 0 }, keep: 6 });
  }
  const r = ranFor === key && state.result;
  const diff = p => {
    const then = heldTiers(p.final, p.body.height, prefs), out = [];
    for (const [k, rank] of then) { const was = nowHeld.get(k) ?? 0; if (rank > was) out.push(`+${goalName(k)}${byName[k].tiers.length > 1 ? ' ' + tierShort(tiers[rank - 1]) : ''}`); }
    for (const [k, was] of nowHeld) { const rank = then.get(k) ?? 0; if (rank < was) out.push(`−${goalName(k)}${rank && byName[k].tiers.length > 1 ? ' to ' + tierShort(tiers[rank - 1]) : ''}`); }
    return out;
  };
  const same = b => b.height === build.body.height && b.weight === build.body.weight && b.wingspan === build.body.wingspan;
  return <section className="card">
    <div className="row-head"><h3>Nearby bodies</h3>
      {state.running ? <button className="mini-btn" onClick={cancel}>Cancel</button>
        : <button className="mini-btn" onClick={search}>{r ? 'Search again' : 'Search'}</button>}</div>
    <div className="toggles" role="group" aria-label="Variant">{VARIANTS.map(([id, text, tip]) => <button key={id} title={tip}
      className={variant === id ? 'on' : ''} aria-pressed={variant === id} onClick={() => setVariant(id)}>{text}</button>)}</div>
    <p className="muted small">{VARIANTS.find(v => v[0] === variant)[2]} Searches {feet(Math.max(69, h - 2))}–{feet(Math.min(88, h + 2))} {build.body.position}.</p>
    {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
      {state.progress && ` ${state.progress.done}/${state.progress.total}`}</p>}
    {state.error && <p className="status-line warn">{state.error}</p>}
    {r && (r.results.length ? <ul className="offers">{r.results.filter(p => !same(p.body) || diff(p).length).slice(0, 5).map((p, k) => {
      const changes = diff(p);
      return <li key={k}>
        <span><b>{feet(p.body.height)}</b> {p.body.weight} lb · {feet(p.body.wingspan)} WS{same(p.body) && ' (this body)'}</span>
        <small>{changes.length ? changes.join(' · ') : 'Same badges, ratings rearranged'}</small>
        <button className="mini-btn" onClick={() => { setBuild({ body: p.body, base: p.manual, breakers: p.breakers });
          notify(`Switched to ${feet(p.body.height)} ${p.body.weight} lb. Ctrl+Z to undo.`); }}>Use</button>
      </li>;
    })}</ul> : <p className="muted small">Nothing nearby keeps those badges.</p>)}
  </section>;
}
