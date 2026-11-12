import React, { useEffect, useMemo, useState } from 'react';
import { assess, attributes, badgeTier, defaultBody, empty, feet, lowerLinkedRatings, name, playerTypeCount, positions, resolveLinks, tiers } from '../engine.js';
import { maximizeBadges, trimDeadWeight, unlockTier } from '../tune.js';
import { BASE_CEILING, DEFAULT_CONTINUOUS, MAX_SPECIALIZED, SPECIALIZATIONS, byName, deadWeight, feelFor, goals, heldTiers, metaScore, nearOfDerived, nextBreakpoint, objective, pickArchetype, valueOf } from '../breakpoints.js';
import { PlanCard, optimizerOptions, useOptimize, usePool } from './LabView.jsx';
import { BROAD_VARIANTS, FOCUS_GROUPS, VARIANTS as DIRECTIONS } from '../variants.js';
import { capsFor } from '../engine.js';
import { buildImage } from './buildImage.js';
import BadgePreview from './BadgePreview.jsx';
import { BreakerChartDetails } from './BreakerChart.jsx';
import { AnimationPanel, TakeoverPanel } from './Unlocks.jsx';
import { derive, groups, nearBadges, tierShort, zeros } from '../derive.js';
import { Bar, NumberInput, Select, TierPill, disciplineColour, label, ratingTone, requirementText } from './common.jsx';
import { shareUrl } from '../share.js';

const choose = (values, i, v) => values.map((old, j) => j === i ? v : old);

export default function BuilderView({ build, setBuild, onSave, notify, library, undo, redo, onSendToLab, onFindExact, prefs, setPrefs, labCfg }) {
  const { body, base, breakers } = build;
  const d = useMemo(() => derive(build), [build]);
  const [locks, setLocks] = useState(() => attributes.map(() => false));
  const [title, setTitle] = useState(build.title ?? '');
  useEffect(() => setTitle(build.title ?? ''), [build.savedId, build.title]);
  const saved = build.savedId && library.some(x => x.id === build.savedId);
  const saveAs = savedId => {
    const t = title.trim() || `${d.finalName ?? 'Build'} · ${body.position} ${feet(body.height)}`;
    const id = onSave({ ...build, title: t, savedId });
    setBuild({ title: t, savedId: id });
  };
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState('badges');
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
  // What each final rating is holding up: the unlocked badge tiers that need it, e.g. Vertical 80 → "Posterizer Gold (80)".
  const holds = useMemo(() => attributes.map((_, i) => d.unlocked.flatMap(u => (u.badge.tiers.find(t => t.tier === u.tier)?.requirements ?? [])
    .filter(r => r.attribute === i && d.final[i] >= r.minimum).map(r => ({ text: `${label(u.badge.name)} ${label(u.tier)}`, at: r.minimum }))))
    .map(list => list.sort((a, b) => b.at - a.at)), [d]);
  const ratingTip = i => {
    const lines = [`${name(attributes[i].name)} ${d.final[i]}${d.final[i] > d.ratings[i] ? ` (${d.ratings[i]} + ${d.final[i] - d.ratings[i]} from Cap Breakers)` : ''}, body cap ${d.caps[i]}`];
    lines.push(holds[i].length ? 'Needed for: ' + holds[i].map(h => `${h.text} (${h.at})`).join(', ') : 'No badge needs this rating.');
    if (d.linkedFloors[i] > 25) lines.push(`Linked minimum ${d.linkedFloors[i]} from other attributes.`);
    if (plusCost[i] != null) lines.push(`+1 base costs ${plusCost[i].toFixed(2)} OVR.`);
    const n = nexts[i];
    if (n && n.rating <= d.caps[i]) lines.push(`Next at ${n.rating}: ` + n.unlocks.map(u => u.specialization ? `${name(u.specialization)} specialization`
      : `${label(u.badge.name)} ${label(u.tier)}${u.alone ? '' : ' (with other ratings)'}`).join(', '));
    return lines.join('\n');
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

  const attrRow = ({ index: i, name: key }, g) => <div key={key}
    className={'attr-row' + (locks[i] ? ' locked' : '')}>
    <div className="attr-name">
      <button className={'lock' + (locks[i] ? ' on' : '')} aria-pressed={locks[i]} title={locks[i] ? 'Unlock' : 'Lock: trim, Get it and Maximize won’t change this'}
        onClick={() => setLocks(choose(locks, i, !locks[i]))}>{locks[i] ? '🔒' : '🔓'}</button>
      <span title={name(key)}>{name(key)}</span>
      {d.linkedFloors[i] > 25 && d.ratings[i] <= d.linkedFloors[i] && <small title="Held up by a linked minimum from other attributes">min {d.linkedFloors[i]}</small>}
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
    <div className="attr-final" title={ratingTip(i)}>
      <strong className={ratingTone(d.final[i]) + (d.final[i] > d.ratings[i] ? ' boosted' : '')}>{d.final[i]}</strong>
      <small title="Body cap">/{d.caps[i]}</small>
      {slack[i] > 0 && <small className="dead" title={`${slack[i]} point${slack[i] > 1 ? 's' : ''} above the last breakpoint you care about (${Math.max(dw.floors[i], d.linkedFloors[i])})`
        + (!nexts[i] || nexts[i].rating > d.caps[i] ? ` — and no valued breakpoint is reachable under this body's cap of ${d.caps[i]}.` : '')}>+{slack[i]}</small>}
    </div>
  </div>;
  const column = list => list.map(g => <div key={g} className="attr-group">
    <h3 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h3>
    {attributes.filter(a => a.discipline === g).map(a => attrRow(a, g))}
  </div>);
  // Cap Breakers on their own, like the in-game screen: each attribute's base → final against its cap and the ladder.
  const breakerRow = ({ index: i, name: key }) => <div key={key} className={'cb-row' + (d.applied[i] ? ' used' : '')}>
    <span className="cb-name">{name(key)}</span>
    <span className="cb-val">{d.applied[i] ? <>{d.ratings[i]}<i>→</i></> : null}<b className={ratingTone(d.final[i])}>{d.final[i]}</b><small>/{d.caps[i]}</small></span>
    <div className="breakers" role="group" aria-label={`${name(key)} Cap Breakers`}>
      {d.ladders[i].map((gain, step) => <button key={step} disabled={!gain}
        className={step < d.applied[i] ? 'on' : ''} aria-pressed={step < d.applied[i]}
        title={gain ? `Breaker ${step + 1}: +${gain}` : 'No gain left'}
        onClick={() => setBuild({ breakers: choose(breakers, i, d.applied[i] === step + 1 ? 0 : step + 1) })}>
        {gain ? '+' + gain : '·'}</button>)}
    </div>
  </div>;
  const copyLink = async () => { const url = shareUrl({ ...build, title }); try { await navigator.clipboard.writeText(url); notify('Share link copied.'); } catch { prompt('Copy this link', url); } };
  const screenshot = async () => {
    const blob = await buildImage({ build, d, title: title.trim(), overall: shownOverall });
    const file = `${(title.trim() || d.finalName || 'build').replace(/[^\w -]+/g, '').trim() || 'build'}.png`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify(`Saved ${file} and copied the image.`); }
    catch { notify(`Saved ${file}.`); }
  };

  return <div className="builder">
    <section className="card build-head">
      <div className="head-row">
        <div className="body-fields">
          <Select compact title="Position" value={body.position} options={Object.keys(positions).map(p => [p, p])} onChange={changePosition} />
          <Select compact stepper title="Height" value={body.height} options={positions[body.position].map(r => [r.height, feet(r.height)])}
            onChange={h => changeHeight(Number(h))} />
          <Select compact stepper title="Weight" value={body.weight} options={range(row.minWeight, row.maxWeight, v => v + ' lb')}
            onChange={w => updateBody({ ...body, weight: Number(w) })} />
          <Select compact stepper title="Wingspan" value={body.wingspan} options={range(row.minWingspan, row.maxWingspan, feet)}
            onChange={w => updateBody({ ...body, wingspan: Number(w) })} />
          <label className="field compact narrow"><span>Breakers</span><NumberInput title="General breakers" value={build.budget} min={0} max={105}
            onChange={v => setBuild({ budget: v })} /></label>
          <Select compact title="Specialization" value={build.category}
            options={[['', 'None'], ...groups.map(g => [g, name(g)])]} onChange={v => setBuild({ category: v, specialCount: v ? MAX_SPECIALIZED : 0 })} />
        </div>
        <div className="head-name">
          <span className="eyebrow">{d.breakerCount ? 'Name after Cap Breakers' : 'Build name'}</span>
          <h2>{d.finalName ?? 'Unnamed build'}</h2>
          <div className="name-stats"><span><b>{d.unlocked.length}</b> badges</span><span><b>{d.badgePoints}</b> tier pts</span>
            <span className={d.overBudget ? 'warn' : ''}><b>{d.generalUsed}/{build.budget}</b> breakers</span>
            {d.breakerCount > 0 && d.name !== d.finalName && <span className="muted">base: {d.name}</span>}</div>
        </div>
        <div className="ovr-block" aria-label={`${shownOverall} Overall`}>
          <span>OVR</span><strong className={shownOverall >= 99 ? 'full' : ''}>{shownOverall}</strong>
          <div className="ovr-meter"><i style={{ width: (Math.min(99, d.state.score) - 25) / 74 * 100 + '%' }} /></div>
          <small>{room ? `${(99 - d.state.score).toFixed(1)} OVR left to spend` : 'Filled to 99'}</small>
        </div>
      </div>
      {(d.overBudget || (build.category && !d.specOk)) && <p className="warn small head-warn">
        {d.overBudget && 'Using more general breakers than your pool. '}
        {build.category && !d.specOk && `${name(build.category)} specialization is locked: needs ${Object.entries(spec?.minimums ?? {})
          .map(([k, v]) => `${name(k)} ${v}`).join(' and ')} base. Specialized breakers count as general until then.`}</p>}
      <div className="toolbar">
        <input type="text" placeholder="Build title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
        <button className="primary" onClick={() => saveAs(saved ? build.savedId : null)}>{saved ? 'Save changes' : 'Save'}</button>
        {saved && <button onClick={() => saveAs(null)}>Save as new</button>}
        <button onClick={screenshot} title="Download (and copy) a picture of the whole build">📷 Screenshot</button>
        <button onClick={copyLink}>Copy link</button>
        <button aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>Text</button>
        <button onClick={() => onSendToLab(build)} title="Keep this build's badges as must-haves and search nearby bodies">Send to Lab</button>
        <button onClick={() => onFindExact(build)} title="New Lab search with every rating of this build as a minimum (same body and breakers): checks the Lab can find it">Find exact</button>
        <span className="spacer" />
        <button onClick={undo} disabled={!undo} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={redo} disabled={!redo} title="Redo (Ctrl+Y)">↷</button>
        <button onClick={() => { setBuild({ base: empty(), breakers: zeros() }); notify('Build reset to 25s. Ctrl+Z to undo.'); }}>Reset</button>
      </div>
      {exportOpen && <textarea readOnly rows={8} value={exportText} onFocus={e => e.target.select()} />}
      <BreakerChartDetails d={d} className="head-chart" />
    </section>

    <div className="builder-grid">
      <div className="builder-main">
      <section className="card attributes-card">
        <p className="muted small legend">Hover a rating to see which badges need it and what's next · <b className="dead-text">+n</b> points above
          your last breakpoint · 🔓 lock a rating so Trim, Get it and Maximize leave it alone</p>
        <div className="attr-columns">
          <div>{column(['finishing', 'shooting', 'playmaking'])}</div>
          <div>{column(groups.filter(g => !['finishing', 'shooting', 'playmaking'].includes(g)))}</div>
        </div>
      </section>

      <section className="card cap-breakers">
        <div className="row-head"><h3>Cap Breakers</h3>
          <div className="bp-stats">
            <span className={d.overBudget ? 'warn' : ''}>General <b>{d.generalUsed}/{build.budget}</b></span>
            {build.category && <span className={d.specOk ? '' : 'warn'}>{name(build.category)} <b>{d.specialUsed}/{MAX_SPECIALIZED}</b>{!d.specOk && ' (locked)'}</span>}
            {d.breakerCount > 0 && <button className="mini-btn" onClick={() => setBuild({ breakers: zeros() })}>Clear</button>}
          </div></div>
        <div className="cb-grid">{groups.map(g => <div key={g} className="cb-group">
          <h4 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h4>
          {attributes.filter(a => a.discipline === g).map(breakerRow)}
        </div>)}</div>
      </section>

      <BadgePreview build={build} d={d} setBuild={setBuild} />
      <TakeoverPanel d={d} setPrefs={setPrefs} notify={notify} />
      <AnimationPanel d={d} height={body.height} setPrefs={setPrefs} notify={notify} />
      </div>

      <aside className="side">
        <div className="toggles side-tabs" role="tablist">{[['badges', 'Badges'], ['improve', 'Improve'], ['alts', 'Alternatives']].map(([id, text]) =>
          <button key={id} role="tab" className={tab === id ? 'on' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{text}</button>)}</div>
        {tab === 'badges' && <>
          <section className="card">
            <div className="row-head"><h3>More badges</h3>
              <button className="mini-btn" onClick={maxBadges} title="Trade budget for more badge tiers without losing any">Maximize</button></div>
            <p className="muted small">Maximize trades budget for extra badge tiers without losing any. Or pick one below.</p>
          </section>
          {near.length > 0 && <section className="card">
            <h3>Within reach</h3>
            <ul className="near">{near.map(n => <li key={n.badge.badge}>
              <span>{label(n.badge.name)} <TierPill tier={n.tier} small />
                <button className="mini-btn" onClick={() => getBadge(n)} title="Raise the needed attributes, trading budget if needed">Get it</button></span>
              <small>{n.gaps.map(g => `${name(g.name)} +${g.gap}`).join(', ')}</small></li>)}</ul>
          </section>}
        </>}
        {tab === 'improve' && <>
          <section className="card">
            <div className="row-head"><h3>Breakpoints</h3>
              <button className="mini-btn" onClick={trim} disabled={!deadPoints} title="Lower ratings to their last breakpoint and reinvest in feel attributes">Trim dead points</button></div>
            {deadPoints ? <p className="small"><b className="dead-text">{deadPoints}</b> rating points sit above the last breakpoint you care about:{' '}
              {attributes.map((a, i) => slack[i] ? `${name(a.name)} +${slack[i]}` : null).filter(Boolean).join(', ')}.</p>
              : <p className="muted small">Every non-feel rating sits on a breakpoint.</p>}
            {highBase.length > 0 && <p className="small warn">Base above 94: {highBase.map(h => `${name(attributes[h.i].name)} ${h.rating} (94 frees ${h.saves.toFixed(1)} OVR)`)
              .join(', ')}. Cap Breakers are the cheaper way up there.</p>}
          </section>
          <TradeOffs build={build} d={d} prefs={buildPrefs} mustHave={labCfg?.mustHave ?? {}} setBuild={setBuild} notify={notify} />
        </>}
        {tab === 'alts' && <>
          <SameBreakpoints build={build} d={d} prefs={prefs} labCfg={labCfg} setBuild={setBuild} onSave={onSave} notify={notify} />
        </>}
      </aside>
    </div>
  </div>;
}

// "What if I drop a badge a tier?" for the build on screen: re-optimizes this body with every other valued tier kept.
function TradeOffs({ build, d, prefs, mustHave, setBuild, notify }) {
  const [state, run, cancel] = useOptimize();
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs, mustHave]);
  const [ranFor, setRanFor] = useState(null);
  const [focusId, setFocusId] = useState('');
  const stale = ranFor !== key + focusId;
  const goalName = n => byName[n]?.label ?? label(n);
  const tierText = (g, t) => byName[g]?.tiers.length > 1 ? (t ? tierShort(t) : 'none') : (t ? '✓' : 'none');
  function price() {
    const opts = optimizerOptions(prefs, { breakers: { general: build.budget, future: 0, special: { category: build.category } }, mustHave });
    const plan = { body: build.body, manual: build.base, base: d.ratings, breakers: d.applied, final: d.final,
      value: objective(d.final, build.body.height, opts), category: build.category };
    setRanFor(key + focusId);
    const v = BROAD_VARIANTS.find(x => x.id === focusId);
    const focus = v ? { opts: v.apply(opts), goals: FOCUS_GROUPS[v.id].goals, attrs: FOCUS_GROUPS[v.id].attrs, label: v.label.toLowerCase() } : null;
    run('tradeoffs', { plan, opts, focus });
  }
  const apply = (p, what) => { setBuild({ base: p.manual, breakers: p.breakers }); notify(`${what}. Ctrl+Z to undo.`); };
  // "Give up Elite contact dunks (keep Pro)", "Give up Dimer HoF → Gold", "Give up Pogo Stick".
  const giveUp = o => {
    if (o.dropMin) return <>Remove the <b>{name(o.dropMin)}</b> minimum ({o.from})</>;
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
    <div className="focus-pick"><Select compact title="Looking for" value={focusId}
      options={[['', 'Best overall value'], ...BROAD_VARIANTS.filter(v => FOCUS_GROUPS[v.id]).map(v => [v.id, v.label])]}
      onChange={setFocusId} /></div>
    {!r && !state.running && <p className="muted small">{focusId
      ? 'Which single requirement (a badge one tier lower, or a minimum) is the cheapest to lower to get this? Keeps every other badge and your feel attributes.'
      : 'What would dropping one badge a tier buy on this body? Uses your Lab importance settings.'}</p>}
    {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
      {state.progress && ` ${state.progress.done}/${state.progress.total}`}</p>}
    {r && <>
      {r.improved && <p className="small">Same badges, better arrangement on this body (+{(r.improved.value - objective(d.final, build.body.height,
        optimizerOptions(prefs, { breakers: { special: { category: build.category } }, mustHave: {} }))).toFixed(1)}).{' '}
        <button className="mini-btn" onClick={() => apply(r.improved, 'Rearranged with the same badges')}>Apply</button></p>}
      {!r.offers.length && <p className="muted small">{focusId ? 'Lowering any single requirement doesn’t buy any of that here.' : 'No one-tier drop buys anything worth more here.'}</p>}
      {r.free && <ul className="offers"><li>
        <span><b>Without lowering anything</b> <span className="muted small">(moves points off things you don’t care about)</span></span>
        <small>{[...r.free.gained.map(g => `+${goalName(g.badge)} ${tierText(g.badge, g.to)}`), ...r.free.attrGains.map(([k, x]) => `${name(k)} +${x}`)].join(' · ')}</small>
        <button className="mini-btn" onClick={() => apply(r.free.plan, 'Re-aimed toward ' + (BROAD_VARIANTS.find(v => v.id === focusId)?.label.toLowerCase() ?? 'that'))}>Apply</button>
      </li></ul>}
      {r.free && r.offers.length > 0 && <p className="muted small">Then, on top of that:</p>}
      <ul className="offers">{r.offers.map(o => <li key={o.drop ?? o.dropMin}>
        <span>{giveUp(o)}</span>
        <small>{[...o.gained.map(g => `+${goalName(g.badge)} ${tierText(g.badge, g.to)}`),
          ...(o.attrGains ?? []).map(([k, x]) => `${name(k)} +${x}`),
          ...o.lost.map(g => `−${goalName(g.badge)} ${tierText(g.badge, g.to)}`),
          o.physical ? `feel ${o.physical > 0 ? '+' : ''}${o.physical}` : ''].filter(Boolean).join(' · ')}{' '}
          <b className={o.net > 0 ? 'good-text' : 'muted'}>{o.net > 0 ? '+' : ''}{o.net.toFixed(1)}</b></small>
        <button className="mini-btn" onClick={() => apply(o.plan, o.dropMin ? `Removed the ${name(o.dropMin)} minimum` : `Dropped ${goalName(o.drop)} a tier`)}>Apply</button>
      </li>)}</ul>
    </>}
  </section>;
}

// Re-optimize with the same breakpoints: every badge and animation tier the build holds becomes a must-have, and the
// optimizer re-plans everything else on this body (base ratings, where the Cap Breakers go, the archetype). The best
// version tries every archetype in parallel; the other options keep something you might not want to lose (speed and
// agility, free throw) or push one direction with the freed Overall. Shown in a dialog to compare and pick from.
const REOPT_DIRECTIONS = ['faster', 'defense', 'rebounding', 'shooting', 'playmaking', 'dunking'];
function SameBreakpoints({ build, d, prefs, labCfg, setBuild, onSave, notify }) {
  const pool = usePool();
  const [state, setState] = useState({ running: false });
  const [open, setOpen] = useState(false);
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs, labCfg?.mode]);
  const fresh = state.key === key;
  const mode = labCfg?.mode ?? 'both';
  const h = build.body.height;
  // Never fewer breakers than the build already uses (a build over its budget keeps what it has).
  const generalNow = Math.max(build.budget, d.generalUsed);
  const metaOfD = x => metaScore(x.final, h, build.body.position, mode, nearOfDerived(x));
  async function run() {
    pool.cancel();
    setOpen(true);
    const mine = pool.token.current, live = () => mine === pool.token.current;
    const mustHave = {};
    for (const g of goals) { const t = badgeTier(g, d.final, h); if (t) mustHave[g.name] = t; }
    const opts = optimizerOptions(prefs, { ...labCfg, from: null, mustHave,
      breakers: { general: generalNow, future: 0, special: { category: build.category } } });
    const at = n => attributes.findIndex(a => a.name === n);
    const floor = (o, names) => ({ ...o, minimums: o.minimums.map((m, i) => names.includes(attributes[i].name) ? Math.max(m, d.final[i]) : m) });
    const options = [
      { id: 'athletic', keep: true, label: 'Keep speed & agility', blurb: `Speed ${d.final[at('speed')]} and agility ${d.final[at('agility')]} don't drop.`,
        o: floor(opts, ['speed', 'agility']) },
      { id: 'ft', keep: true, label: 'Keep free throw', blurb: `Free throw stays at ${d.final[at('free_throw')]}+.`, o: floor(opts, ['free_throw']) },
      ...DIRECTIONS.filter(v => REOPT_DIRECTIONS.includes(v.id)).map(v => ({ id: v.id, label: v.label, blurb: v.blurb, o: v.apply(opts) })),
    ];
    const progress = label => (done, total) => live() && setState(s => ({ ...s, progress: { label, done, total } }));
    setState({ running: true, key, progress: { label: 'Re-planning' } });
    // Natural archetype for the best version, plus every option (each with its 3 likeliest archetypes) in one batch.
    const firstRound = await pool.runJobs([{ kind: 'body', options: { body: build.body, opts: { ...opts, archetypes: false } } },
      ...options.map(x => ({ kind: 'body', options: { body: build.body, opts: x.o } }))], progress('Re-planning'));
    if (!live()) return;
    const [first, ...outs] = firstRound;
    // The natural archetype may not hold every tier (builds sitting on an archetype line): try all of them anyway.
    const ok = first && !first.error;
    const seeded = ok && first.seed ? { ...mustHave, [first.seed.name]: first.seed.tier } : mustHave;
    const types = Array.from({ length: playerTypeCount(h) }, (_, t) => t).filter(t => !ok || t !== first.playerType);
    const alts = (await pool.runJobs(types.map(type => ({ kind: 'body', options: { body: build.body,
      opts: { ...opts, mustHave: seeded, forceType: type, archetypes: false, seeds: 0 } } })), progress('Trying every archetype')))
      .filter(r => r && !r.error);
    if (!live()) return;
    if (!ok && !alts.length) return setState({ running: false, key, error: first?.error ?? 'The optimizer could not finish.' });
    const lead = ok ? first : alts.reduce((a, b) => b.value > a.value ? b : a);
    const best = pickArchetype(lead, alts.filter(r => r !== lead), build.body, opts);
    const derived = r => derive({ body: r.body, base: r.manual, breakers: r.breakers, budget: r.budget, category: r.category });
    const bestD = derived(best);
    const list = [{ id: 'best', label: 'Best overall', blurb: 'Most meta + picks with the Overall the re-plan frees.', plan: best, pd: bestD }];
    outs.forEach((r, k) => {
      const x = options[k];
      // "Keep" options always show (or say why they can't); directions only when they differ from what's listed.
      if (!r || r.error) { if (x.keep) list.push({ ...x, error: "Can't keep that and every badge tier on this body." }); return; }
      const pd = derived(r);
      const twin = list.find(y => y.pd && y.pd.final.reduce((s, v, i) => s + Math.abs(v - pd.final[i]), 0) < 8);
      if (twin && !x.keep) return;
      list.push({ ...x, plan: r, pd, sameAs: twin?.label });
    });
    setState({ running: false, key, list });
  }
  const use = p => { setBuild({ base: p.manual, breakers: p.breakers }); setOpen(false); notify('Applied: same badges, re-planned. Ctrl+Z to undo.'); };
  const metaNow = metaOfD(d);
  const changesOf = pd => attributes.map((a, i) => ({ a, x: pd.final[i] - d.final[i] })).filter(c => c.x).sort((x, y) => y.x - x.x);
  return <section className="card recommender">
    <div className="row-head"><h3>Same breakpoints, better build</h3>
      <button className="mini-btn" onClick={() => fresh && state.list ? setOpen(true) : run()}>{fresh && state.list ? 'Show options' : 'Re-optimize…'}</button></div>
    <p className="muted small">Keeps every badge and animation tier this build has, on this body, with {generalNow} Cap Breakers
      {generalNow > build.budget ? ' (what it uses now, over your budget)' : ''}; re-plans the base ratings, where the breakers go and the
      archetype, then shows a few ways to spend what that frees.</p>
    {open && <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal reopt" role="dialog" aria-modal="true" aria-label="Re-optimize options">
        <div className="row-head"><h3>Same breakpoints · options</h3>
          <div className="actions">{!state.running && <button className="mini-btn" onClick={run}>Run again</button>}
            {state.running && <button className="mini-btn" onClick={() => { pool.cancel(); setState(s => ({ ...s, running: false })); }}>Cancel</button>}
            <button className="mini-btn" aria-label="Close" onClick={() => setOpen(false)}>✕</button></div></div>
        <p className="muted small">Now: meta {metaNow.toFixed(1)} · {d.breakerCount} breakers. Every option keeps all {d.unlocked.length} badge tiers.</p>
        {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
          {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''}</p>}
        {state.error && <p className="status-line warn">{state.error}</p>}
        {fresh && state.list && <div className="reopt-list">{state.list.map(x => {
          if (x.error) return <div key={x.id} className="reopt-option"><b>{x.label}</b> <span className="muted small">{x.error}</span></div>;
          const changes = changesOf(x.pd), m = metaOfD(x.pd);
          return <div key={x.id} className="reopt-option">
            <div className="row-head"><div><b>{x.label}</b> <span className="muted small">{x.blurb}{x.sameAs ? ` About the same as ${x.sameAs}.` : ''}</span></div>
              <div className="actions"><span className={'reopt-meta ' + (m >= metaNow ? 'up' : 'down')}>meta {metaNow.toFixed(1)} → <b>{m.toFixed(1)}</b></span>
                <button className="primary mini-btn" disabled={!changes.length} onClick={() => use(x.plan)}>Use this</button></div></div>
            {changes.length ? <div className="chips">{changes.map(({ a, x: v }) => <span key={a.name} className={'chip ' + (v > 0 ? 'up' : 'down')}>
              {v > 0 ? '+' : ''}{v} {name(a.name)}</span>)}</div> : <p className="muted small">Same ratings as now: nothing to free.</p>}
            <details><summary className="small">Full build</summary>
              <PlanCard plan={x.plan} prefs={prefs} mode={mode} onOpen={use} onSave={onSave} openLabel="Use this" /></details>
          </div>;
        })}</div>}
      </div></div>}
  </section>;
}
