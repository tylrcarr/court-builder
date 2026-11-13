import React, { useEffect, useMemo, useState } from 'react';
import { assess, attributes, badgeTier, defaultBody, empty, feet, inHeight, lowerLinkedRatings, name, playerTypeCount, positions, resolveLinks, tiers } from '../engine.js';
import { maximizeBadges, trimDeadWeight, unlockTier } from '../tune.js';
import { BASE_CEILING, DEFAULT_CONTINUOUS, MAX_SPECIALIZED, SPECIALIZATIONS, archetypeHolders, byName, deadWeight, feelFor, goals, heldTiers, metaScore, nearOfDerived, nextBreakpoint, objective, pickArchetype, valueOf } from '../breakpoints.js';
import { Elapsed, PlanCard, optimizerOptions, useOptimize, usePool } from './LabView.jsx';
import { archetypeName } from '../archetypes.js';
import { metaOf } from '../meta.js';
import { BROAD_VARIANTS, FOCUS_GROUPS, VARIANTS as DIRECTIONS } from '../variants.js';
import { capsFor } from '../engine.js';
import { buildImage } from './buildImage.js';
import BadgePreview from './BadgePreview.jsx';
import { BreakerChart, HoldersNote, breakerSavings } from './BreakerChart.jsx';
import { AnimationPanel, TakeoverPanel } from './Unlocks.jsx';
import { derive, groups, nearBadges, tierShort, zeros } from '../derive.js';
import { Archetype, Bar, Modal, NumberInput, QuickCard, Select, TierPill, disciplineColour, label, ratingTone, requirementText } from './common.jsx';
import { animations } from '../animations.js';
import { takeovers } from '../unlocks.js';
import { availableAt, findAnimation } from '../anim-wants.js';
import { shareUrl } from '../share.js';
import { AttrBadges } from './AttrBadges.jsx';

const choose = (values, i, v) => values.map((old, j) => j === i ? v : old);

export default function BuilderView({ build, setBuild, onSave, notify, library, undo, redo, onSendToLab, onFindExact, prefs, setPrefs, labCfg,
  history = [], setHistory, onCheckpoint, onRevert, onWantInLab }) {
  const { body, base, breakers } = build;
  const d = useMemo(() => derive(build), [build]);
  const [locks, setLocks] = useState(() => attributes.map(() => false));
  const [title, setTitle] = useState(build.title ?? '');
  useEffect(() => setTitle(build.title ?? ''), [build.savedId, build.title]);
  const saved = build.savedId && library.some(x => x.id === build.savedId);
  const saveAs = savedId => {
    const t = title.trim() || `${d.finalName ?? 'Build'} · ${body.position} ${feet(body.height)}`;
    const id = onSave({ ...build, title: t, savedId }, true);
    setBuild({ title: t, savedId: id });
  };
  const [exportOpen, setExportOpen] = useState(false);
  const [tab, setTab] = useState('improve');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openAttr, setOpenAttr] = useState(null); // attribute whose badge list is open
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
  // Breakpoints come from the build itself: every badge and animation tier it holds is a floor (not the Lab's importance
  // settings, which describe a search). Only the feel attributes come from your preferences.
  const ownPrefs = useMemo(() => ({ ...buildPrefs, values: { '*': 1 }, caps: {} }), [buildPrefs]);
  // Takeovers the build has and animations you want hold their ratings too (Rim Guardian: 80 interior D and 80 block).
  const extraFloors = useMemo(() => {
    const f = attributes.map(() => 25), why = attributes.map(() => []);
    const hold = (reqs, or, what) => {
      const met = reqs.filter(([i, m]) => d.final[i] >= m);
      if (or ? !met.length : met.length < reqs.length) return;
      for (const [i, m] of or && met.length > 1 ? [] : met) if (m >= f[i]) { f[i] = m; why[i].push(`${what} (${m})`); }
    };
    for (const t of takeovers) hold(t.reqs, t.or, `${t.name} takeover`);
    for (const k of prefs.wantAnims ?? []) { const a = findAnimation(k); if (a && availableAt(a, body.height)) hold(a.reqs, a.or, a.name + ' ' + a.group); }
    return { f, why };
  }, [d.final, prefs.wantAnims, body.height]);
  const dw = useMemo(() => {
    const raw = deadWeight(d.final, body.height, ownPrefs, build.category, d.ratings);
    const floors = raw.floors.map((v, i) => Math.max(v, Math.min(d.final[i], extraFloors.f[i])));
    return { floors, slack: d.final.map((v, i) => v - floors[i]) };
  }, [d, ownPrefs, build.category, extraFloors]);
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
  // Ratings holding the archetype only have as many dead points as they can drop before it changes; locked ones have none.
  const holders = useMemo(() => archetypeHolders(d), [d]);
  const slack = useMemo(() => dw.slack.map((x, i) => {
    if (d.applied[i] > 0 || locks[i]) return 0;
    const h = holders.find(y => y.i === i);
    return Math.max(0, Math.min(x, d.final[i] - d.linkedFloors[i], h ? h.free : 99));
  }), [dw, d, holders, locks]);
  const deadPoints = slack.reduce((s, x) => s + x, 0);
  // What each final rating is holding up: the unlocked badge tiers that need it, e.g. Vertical 80 → "Posterizer Gold (80)".
  const holdsBadges = useMemo(() => attributes.map((_, i) => d.unlocked.flatMap(u => (u.badge.tiers.find(t => t.tier === u.tier)?.requirements ?? [])
    .filter(r => r.attribute === i && d.final[i] >= r.minimum).map(r => ({ text: `${label(u.badge.name)} ${label(u.tier)}`, at: r.minimum }))))
    .map(list => list.sort((a, b) => b.at - a.at)), [d]);
  const ratingTip = i => {
    const lines = [`${name(attributes[i].name)} ${d.final[i]}${d.final[i] > d.ratings[i] ? ` (${d.ratings[i]} + ${d.final[i] - d.ratings[i]} from Cap Breakers)` : ''}, body cap ${d.caps[i]}`];
    const needs = [...holdsBadges[i].map(h => `${h.text} (${h.at})`), ...extraFloors.why[i]];
    lines.push(needs.length ? 'Needed for: ' + needs.join(', ') : 'No badge, takeover or wanted animation needs this rating.');
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
    setBuild({ body: next, base: adjusted.map((v, i) => Math.min(v, caps[i])) }, 'Changed body');
    notify('Body updated. Ratings above the new caps were lowered.');
  }
  function changePosition(position) {
    const r = positions[position].find(o => o.height === body.height);
    if (r && body.weight >= r.minWeight && body.weight <= r.maxWeight && body.wingspan >= r.minWingspan && body.wingspan <= r.maxWingspan)
      return setBuild({ body: { ...body, position } }, `Position ${position}`);
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
    setBuild({ base: result.base }, `Get ${label(n.badge.name)} ${label(n.tier)}`);
    const traded = Object.entries(result.trimmed).map(([i, k]) => `${name(attributes[i].name)} −${k}`).join(', ');
    notify(`Unlocked ${label(n.badge.name)} ${label(n.tier)}${traded ? ' by trading ' + traded : ''}. Ctrl+Z to undo.`);
  }
  function maxBadges() {
    const before = d.badgePoints;
    const result = maximizeBadges(build, locks);
    if (!result.gained.length) return notify('No badge upgrades fit without losing something. Try unlocking attributes.');
    setBuild({ base: result.build.base }, 'Maximize badges');
    notify(`+${result.points - before} badge tier points: ${result.gained.map(g => label(g.split(' ')[0])).join(', ')}. Ctrl+Z to undo.`);
  }
  function trim() {
    const result = trimDeadWeight(build, { ...effective, values: { '*': 1 }, caps: {} }, locks, extraFloors.f);
    if (result.freed < 0.01 && !result.changes.length) return notify('Already on breakpoints — nothing to trim.');
    setBuild({ base: result.base }, 'Trim dead points');
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
      <button className={'attr-link' + (openAttr === i ? ' open' : '')} aria-expanded={openAttr === i}
        title={`${name(key)}: show the badges it unlocks and their levels`} onClick={() => setOpenAttr(openAttr === i ? null : i)}>
        {name(key)}<span className="caret" aria-hidden>▾</span></button>
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
      {slack[i] > 0 && <small className="dead" title={`${slack[i]} point${slack[i] > 1 ? 's' : ''} above the last breakpoint this build uses (${Math.max(dw.floors[i], d.linkedFloors[i])})`
        + (!nexts[i] || nexts[i].rating > d.caps[i] ? ` — and no valued breakpoint is reachable under this body's cap of ${d.caps[i]}.` : '')}>+{slack[i]}</small>}
    </div>
    {openAttr === i && <AttrBadges d={d} i={i} onSet={v => { if (!setRating(i, Math.min(d.caps[i], v))) notify(`Can't set ${name(key)} there: over budget or linked limits.`); }} />}
  </div>;
  const column = list => list.map(g => <div key={g} className="attr-group">
    <h3 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h3>
    {attributes.filter(a => a.discipline === g).map(a => attrRow(a, g))}
  </div>);
  // Cap Breakers like the in-game screen: click a step to set that many, click the last lit one to clear them all.
  const onStep = (i, count) => setBuild({ breakers: choose(d.applied, i, count) }, 'Cap Breakers');
  const sv = useMemo(() => breakerSavings(d), [d]);
  const savedOvr = sv ? attributes.reduce((s, { index: i }) => s + sv[i].slice(0, d.applied[i]).reduce((t, x) => t + x, 0), 0) : 0;
  const copyLink = async () => { const url = shareUrl({ ...build, title }); try { await navigator.clipboard.writeText(url); notify('Share link copied.'); } catch { prompt('Copy this link', url); } };
  const screenshot = async () => {
    const blob = await buildImage({ build, d, title: title.trim(), overall: shownOverall, savings: sv });
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
        <div className="tb-group">
          <input type="text" placeholder="Build title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
          <button className="primary" onClick={() => saveAs(saved ? build.savedId : null)}>{saved ? 'Save changes' : 'Save'}</button>
          {saved && <button onClick={() => saveAs(null)}>Save as new</button>}
        </div>
        <div className="tb-group" role="group" aria-label="Share"><span className="tb-label">Share</span>
          <button onClick={screenshot} title="Download (and copy) a picture of the whole build, Cap Breaker chart included">📷 Screenshot</button>
          <button onClick={copyLink}>Copy link</button>
          <button aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>Text</button>
        </div>
        <div className="tb-group" role="group" aria-label="Lab"><span className="tb-label">Lab</span>
          <button onClick={() => onFindExact(build)} title="New Lab search with every rating of this build as a minimum (same body and breakers): finds this build and anything strictly better">Send to Lab</button>
          <button onClick={() => onSendToLab(build)} title="Keep this build's badges as must-haves and search nearby bodies">Find by badges</button>
        </div>
        <span className="spacer" />
        <div className="tb-group" role="group" aria-label="History">
          <button onClick={undo} disabled={!undo} title="Undo (Ctrl+Z)">↶</button>
          <button onClick={redo} disabled={!redo} title="Redo (Ctrl+Y)">↷</button>
          <button onClick={() => setHistoryOpen(true)} title="Every change you made, with save points to go back to">History{history.length ? ` (${history.length})` : ''}</button>
          <button onClick={() => onCheckpoint()} title="Mark this version so you can come back to it">＋ Save point</button>
          <button onClick={() => { setBuild({ base: empty(), breakers: zeros() }, 'Reset to 25s'); notify('Build reset to 25s. Ctrl+Z to undo.'); }}>Reset</button>
        </div>
      </div>
      {exportOpen && <textarea readOnly rows={8} value={exportText} onFocus={e => e.target.select()} />}
    </section>
    {historyOpen && <HistoryDialog d={d} build={build} history={history} setHistory={setHistory} onRevert={e => { onRevert(e); setHistoryOpen(false); }}
      onCheckpoint={onCheckpoint} onClose={() => setHistoryOpen(false)} />}

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
        <div className="row-head"><h3>Cap Breakers <span className="muted small">· <Archetype height={body.height} type={d.state.playerType} /></span></h3>
          <div className="bp-stats">
            <span className={d.overBudget ? 'warn' : ''}>General <b>{d.generalUsed}/{build.budget}</b></span>
            {build.category && <span className={d.specOk ? '' : 'warn'}>{name(build.category)} <b>{d.specialUsed}/{MAX_SPECIALIZED}</b>{!d.specOk && ' (locked)'}</span>}
            {savedOvr > 0 && <span title="Overall the applied breakers save (what those points would cost as base)">saves <b>{savedOvr.toFixed(1)}</b> OVR</span>}
            {d.breakerCount > 0 && <button className="mini-btn" onClick={() => setBuild({ breakers: zeros() }, 'Cleared Cap Breakers')}>Clear</button>}
          </div></div>
        <HoldersNote d={d} />
        <BreakerChart d={d} savings={sv} onStep={onStep} showArchetype={false} />
      </section>

      <BadgePreview build={build} d={d} setBuild={(patch, lbl) => setBuild(patch, lbl ?? 'Badges')} />
      <TakeoverPanel d={d} setPrefs={setPrefs} notify={notify} />
      <AnimationPanel d={d} height={body.height} setPrefs={setPrefs} notify={notify} />
      </div>

      <aside className="side">
        <div className="toggles side-tabs" role="tablist">{[['improve', 'Improve'], ['badges', 'More badges']].map(([id, text]) =>
          <button key={id} role="tab" className={tab === id ? 'on' : ''} aria-selected={tab === id} onClick={() => setTab(id)}>{text}</button>)}</div>
        {tab === 'improve' && <>
          <Optimize build={build} d={d} prefs={prefs} labCfg={labCfg} setBuild={setBuild} onSave={onSave} notify={notify} locks={locks} />
          <WantThis build={build} d={d} prefs={prefs} labCfg={labCfg} setBuild={setBuild} notify={notify} onWantInLab={onWantInLab} />
          <section className="card">
            <div className="row-head"><h3>Breakpoints</h3>
              <button className="mini-btn" onClick={trim} disabled={!deadPoints} title="Lower ratings to their last breakpoint (locked ratings and the archetype stay) and reinvest in feel attributes">Trim dead points</button></div>
            {deadPoints ? <p className="small"><b className="dead-text">{deadPoints}</b> rating points sit above the last badge breakpoint this build uses:{' '}
              {attributes.map((a, i) => slack[i] ? `${name(a.name)} +${slack[i]}` : null).filter(Boolean).join(', ')}.</p>
              : <p className="muted small">Every non-feel rating sits on one of this build's badge breakpoints{locks.some(Boolean) ? ' (locked ratings aren’t counted)' : ''}.</p>}
            {holders.some(h => dw.slack[h.i] > h.free) && <p className="muted small">Not counted: points that hold the archetype ({holders.filter(h => dw.slack[h.i] > h.free)
              .map(h => name(attributes[h.i].name)).join(', ')}): dropping them changes every Cap Breaker step.</p>}
            {highBase.length > 0 && <p className="small warn">Base above 94: {highBase.map(h => `${name(attributes[h.i].name)} ${h.rating} (94 frees ${h.saves.toFixed(1)} OVR)`)
              .join(', ')}. Cap Breakers are the cheaper way up there.</p>}
          </section>
          <TradeOffs build={build} d={d} prefs={buildPrefs} mustHave={labCfg?.mustHave ?? {}} setBuild={setBuild} notify={notify} />
        </>}
        {tab === 'badges' && <>
          <section className="card">
            <div className="row-head"><h3>More badges</h3>
              <button className="mini-btn" onClick={maxBadges} title="Trade budget for more badge tiers without losing any, on this archetype">Maximize</button></div>
            <p className="muted small">Maximize trades budget for extra badge tiers without losing any, keeping this archetype. For the most badges across
              every archetype, use <b>Optimize → Most badges</b>. Or pick one below.</p>
          </section>
          {near.length > 0 && <section className="card">
            <h3>Within reach</h3>
            <ul className="near">{near.map(n => <li key={n.badge.badge}>
              <span>{label(n.badge.name)} <TierPill tier={n.tier} small />
                <button className="mini-btn" onClick={() => getBadge(n)} title="Raise the needed attributes, trading budget if needed">Get it</button></span>
              <small>{n.gaps.map(g => `${name(g.name)} +${g.gap}`).join(', ')}</small></li>)}</ul>
          </section>}
        </>}
      </aside>
    </div>
  </div>;
}

// Plan → derived build on this body (for quick cards).
const derivedOf = (build, p) => derive({ body: p.body ?? build.body, base: p.manual, breakers: p.breakers, budget: build.budget, category: build.category });
const sumDiff = (a, b) => a.final.reduce((s, v, i) => s + Math.abs(v - b.final[i]), 0);
// Options that come out the same build (within a couple of rating points) show once, with every label that led there.
function mergeSame(list) {
  const out = [];
  for (const x of list) {
    const twin = x.pd && out.find(y => y.pd && sumDiff(y.pd, x.pd) <= 2);
    if (twin) twin.also = [...(twin.also ?? []), x.label];
    else out.push({ ...x });
  }
  return out;
}

// "What if I drop a badge a tier?" for the build on screen: re-optimizes this body with every other valued tier kept.
// Results open in a dialog of quick cards (green/red against the build you have).
function TradeOffs({ build, d, prefs, mustHave, setBuild, notify }) {
  const [state, run, cancel] = useOptimize();
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs, mustHave]);
  const [ranFor, setRanFor] = useState(null);
  const [focusId, setFocusId] = useState('');
  const [open, setOpen] = useState(false);
  const stale = ranFor !== key + focusId;
  const goalName = n => byName[n]?.label ?? label(n);
  const tierText = (g, t) => byName[g]?.tiers.length > 1 ? (t ? tierShort(t) : 'none') : (t ? '✓' : 'none');
  function price() {
    const opts = optimizerOptions(prefs, { breakers: { general: build.budget, future: 0, special: { category: build.category } }, mustHave });
    const plan = { body: build.body, manual: build.base, base: d.ratings, breakers: d.applied, final: d.final,
      value: objective(d.final, build.body.height, opts), category: build.category };
    setRanFor(key + focusId); setOpen(true);
    const v = BROAD_VARIANTS.find(x => x.id === focusId);
    const focus = v ? { opts: v.apply(opts), goals: FOCUS_GROUPS[v.id].goals, attrs: FOCUS_GROUPS[v.id].attrs, label: v.label.toLowerCase() } : null;
    run('tradeoffs', { plan, opts, focus });
  }
  const apply = (p, what) => { setBuild({ base: p.manual, breakers: p.breakers }, what); setOpen(false); notify(`${what}. Ctrl+Z to undo.`); };
  const giveUp = o => {
    if (o.dropMin) return `Remove the ${name(o.dropMin)} minimum (${o.from})`;
    const keepsPro = o.drop === 'elite_contact_off_two' && !o.lost.some(g => g.badge === 'pro_contact_off_two');
    const multi = byName[o.drop]?.tiers.length > 1;
    return `Give up ${goalName(o.drop)}${multi ? ` ${tierShort(o.from)}${o.to ? ` → ${tierShort(o.to)}` : ' entirely'}` : ''}${keepsPro ? ' (keep Pro)' : ''}`;
  };
  const r = !stale && state.result;
  const cards = r ? [
    ...(r.improved ? [{ id: 'improved', title: 'Same badges, better arrangement', plan: r.improved, what: 'Rearranged with the same badges' }] : []),
    ...(r.free ? [{ id: 'free', title: 'Without lowering anything', blurb: 'moves points off things you don’t care about', plan: r.free.plan,
      what: 'Re-aimed toward ' + (BROAD_VARIANTS.find(v => v.id === focusId)?.label.toLowerCase() ?? 'that') }] : []),
    ...r.offers.map(o => ({ id: o.drop ?? o.dropMin, title: giveUp(o), plan: o.plan, net: o.net,
      what: o.dropMin ? `Removed the ${name(o.dropMin)} minimum` : `Dropped ${goalName(o.drop)} a tier` })),
  ] : [];
  return <section className="card">
    <div className="row-head"><h3>Trade-offs</h3>
      {state.running ? <button className="mini-btn" onClick={cancel}>Cancel</button>
        : r ? <button className="mini-btn" onClick={() => setOpen(true)}>Show {cards.length}</button>
        : <button className="mini-btn" onClick={price}>Find trade-offs</button>}</div>
    <div className="focus-pick"><Select compact title="Looking for" value={focusId}
      options={[['', 'Best overall value'], ...BROAD_VARIANTS.filter(v => FOCUS_GROUPS[v.id]).map(v => [v.id, v.label])]}
      onChange={setFocusId} /></div>
    <p className="muted small">{focusId
      ? 'Which single requirement (a badge one tier lower, or a minimum) is the cheapest to lower to get this? Keeps every other badge and your feel attributes.'
      : 'What would dropping one badge a tier buy on this body? Uses your Lab importance settings.'}</p>
    {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
      {state.progress && ` ${state.progress.done}/${state.progress.total}`}</p>}
    {open && (state.running || r) && <Modal wide title="Trade-offs" onClose={() => setOpen(false)}
      actions={!state.running && <button className="mini-btn" onClick={price}>Re-check</button>}>
      <p className="muted small">Each card is this body re-planned: ▲ green went up, ▼ red went down, compared with the build you have.</p>
      {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…</p>}
      {r && !cards.length && <p className="muted small">{focusId ? 'Lowering any single requirement doesn’t buy any of that here.' : 'No one-tier drop buys anything worth more here.'}</p>}
      <div className="quick-list">{cards.map(c => <QuickCard key={c.id} d={derivedOf(build, c.plan)} from={d} title={c.title} blurb={c.blurb}
        stats={c.net != null && <b className={c.net > 0 ? 'good-text' : 'muted'}>{c.net > 0 ? '+' : ''}{c.net.toFixed(1)}</b>}
        onApply={() => apply(c.plan, c.what)} applyLabel="Apply" />)}</div>
    </Modal>}
  </section>;
}

// Optimize: re-plan this body. Every option keeps every badge and animation tier the build holds (as must-haves) and
// locked ratings; the optimizer re-plans the rest (base ratings, where the Cap Breakers go, the archetype). The best version
// tries every archetype in parallel; the others keep something you might not want to lose, push one direction with the
// freed Overall, chase the most badges, or switch to another archetype. Same builds merge into one card.
const REOPT_DIRECTIONS = ['faster', 'defense', 'rebounding', 'shooting', 'playmaking', 'dunking'];
function Optimize({ build, d, prefs, labCfg, setBuild, onSave, notify, locks }) {
  const pool = usePool();
  const [state, setState] = useState({ running: false });
  const [open, setOpen] = useState(false);
  const key = JSON.stringify([build.body, build.base, build.breakers, build.budget, build.category, prefs, labCfg?.mode, locks]);
  const fresh = state.key === key;
  const mode = labCfg?.mode ?? 'both';
  const h = build.body.height;
  const generalNow = Math.max(build.budget, d.generalUsed);
  const metaOfD = x => metaScore(x.final, h, build.body.position, mode, nearOfDerived(x));
  async function run() {
    pool.cancel();
    setOpen(true);
    const mine = pool.token.current, live = () => mine === pool.token.current, started = performance.now();
    const mustHave = {};
    for (const g of goals) { const t = badgeTier(g, d.final, h); if (t) mustHave[g.name] = t; }
    const labOpts = optimizerOptions(prefs, { ...labCfg, from: null, mustHave,
      breakers: { general: generalNow, future: 0, special: { category: build.category } } });
    // Lab minimums were set for another search: keep only what this build has. Locked ratings stay exactly where they are.
    const opts = { ...labOpts,
      minimums: labOpts.minimums.map((m, i) => locks[i] ? d.final[i] : Math.min(m, d.final[i], d.caps[i])),
      maximums: labOpts.maximums.map((m, i) => locks[i] ? d.final[i] : m) };
    const at = n => attributes.findIndex(a => a.name === n);
    const floor = (o, names) => ({ ...o, minimums: o.minimums.map((m, i) => names.includes(attributes[i].name) ? Math.max(m, d.final[i]) : m) });
    const most = BROAD_VARIANTS.find(v => v.id === 'most-badges');
    const options = [
      { id: 'athletic', keep: true, label: 'Keep speed & agility', blurb: `Speed ${d.final[at('speed')]} / agility ${d.final[at('agility')]} stay.`,
        o: floor(opts, ['speed', 'agility']) },
      { id: 'ft', keep: true, label: 'Keep free throw', blurb: `Free throw stays ${d.final[at('free_throw')]}+.`, o: floor(opts, ['free_throw']) },
      { id: 'most', label: 'Most badges', blurb: 'Extra badge tiers, any kind.', o: most.apply(opts) },
      ...DIRECTIONS.filter(v => REOPT_DIRECTIONS.includes(v.id)).map(v => ({ id: v.id, label: v.label, blurb: v.blurb, o: v.apply(opts) })),
    ];
    const progress = label => (done, total) => live() && setState(s => ({ ...s, progress: { label, done, total } }));
    setState({ running: true, key, started, progress: { label: 'Re-planning' } });
    const firstRound = await pool.runJobs([{ kind: 'body', options: { body: build.body, opts: { ...opts, archetypes: false } } },
      ...options.map(x => ({ kind: 'body', options: { body: build.body, opts: x.o } }))], progress('Re-planning'));
    if (!live()) return;
    const [first, ...outs] = firstRound;
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
    const list = [{ id: 'best', label: 'Best for your picks', blurb: 'Your Lab picks first, then meta.', plan: best, pd: bestD }];
    outs.forEach((r, k) => {
      const x = options[k];
      if (!r || r.error) { if (x.keep) list.push({ ...x, error: "Can't keep that and every badge tier on this body." }); return; }
      list.push({ ...x, plan: r, pd: derived(r) });
    });
    // The two best other archetypes, as their own options (where the breakers land changes everything).
    const others = alts.filter(r => r.playerType !== best.playerType).sort((a, b) => metaOfD(derived(b)) + b.value - metaOfD(derived(a)) - a.value).slice(0, 2);
    for (const r of others) list.push({ id: 'type-' + r.playerType, label: `As ${archetypeName(h, r.playerType)}`,
      blurb: 'Breakers land on different ratings.', plan: r, pd: derived(r) });
    setState({ running: false, key, list: mergeSame(list), ms: performance.now() - started });
  }
  const use = (p, what) => { setBuild({ base: p.manual, breakers: p.breakers }, `Optimize: ${what}`); setOpen(false); notify(`Applied ${what}. Ctrl+Z to undo.`); };
  const metaNow = metaOfD(d);
  return <section className="card recommender">
    <div className="row-head"><h3>Optimize</h3>
      <button className="mini-btn primary" onClick={() => fresh && state.list ? setOpen(true) : run()}>{fresh && state.list ? 'Show options' : 'Optimize…'}</button></div>
    <p className="muted small">Same badges{locks.some(Boolean) ? ' and locked ratings' : ''}, same body, {generalNow} Cap Breakers. Re-plans everything else and
      shows a few ways to spend what that frees.</p>
    {state.running && !open && <p className="status-line"><span className="spinner" />{state.progress?.label}… <Elapsed started={state.started} /></p>}
    {open && <Modal wide title="Optimize · same badges, re-planned" onClose={() => setOpen(false)}
      actions={<>{!state.running && <button className="mini-btn" onClick={run}>Run again</button>}
        {state.running && <button className="mini-btn" onClick={() => { pool.cancel(); setState(s => ({ ...s, running: false })); }}>Cancel</button>}</>}>
      <p className="muted small">Your build: meta <b>{metaNow.toFixed(1)}</b> · {d.unlocked.length} badges. Every option keeps all of them. <span className="good-text">▲</span> / <span className="bad-text">▼</span> = vs your build.</p>
      {state.running && <p className="status-line"><span className="spinner" />{state.progress?.label ?? 'Starting'}…
        {state.progress?.total ? ` ${state.progress.done}/${state.progress.total}` : ''} <Elapsed started={state.started} /></p>}
      {state.error && <p className="status-line warn">{state.error}</p>}
      {fresh && state.list && (() => {
        const topMeta = Math.max(...state.list.filter(x => x.pd).map(x => metaOfD(x.pd)));
        return <div className="quick-list">{state.list.map(x => x.error
          ? <article key={x.id} className="quick-card"><b>{x.label}</b><span className="muted small">{x.error}</span></article>
          : <QuickCard key={x.id} d={x.pd} from={d} title={x.label} blurb={x.blurb}
            stats={(() => { const m = metaOfD(x.pd); return <span className={'reopt-meta ' + (m >= metaNow ? 'up' : 'down')} title="Meta score">
              {m >= topMeta - 1e-9 && <span className="tag-top" title="Highest meta score of these options">Top meta</span>} meta <b>{m.toFixed(1)}</b></span>; })()}
            onApply={() => use(x.plan, x.label)}>
            {x.also && <div className="also-tags"><span className="muted small">Same result:</span>{x.also.map(a => <span key={a} className="chip">{a}</span>)}</div>}
          </QuickCard>)}</div>;
      })()}
    </Modal>}
  </section>;
}

// "I want this": pick a badge tier, an animation or a rating, and see ways to get it on this body: keeping every badge
// you have, keeping only the ones you care most about, or starting over around it. Or search the Lab for it.
function WantThis({ build, d, prefs, labCfg, setBuild, notify, onWantInLab }) {
  const pool = usePool();
  const [what, setWhat] = useState('');
  const [level, setLevel] = useState('');
  const [state, setState] = useState({ running: false });
  const [open, setOpen] = useState(false);
  const h = build.body.height;
  const goal = what.startsWith('g:') ? byName[what.slice(2)] : null;
  const attr = what.startsWith('a:') ? attributes.find(a => a.name === what.slice(2)) : null;
  const multi = goal && goal.tiers.length > 1;
  const have = goal ? badgeTier(goal, d.final, h) : attr ? d.final[attr.index] : null;
  const levels = goal ? (multi ? tiers.filter(t => tiers.indexOf(t) > tiers.indexOf(have)) : have ? [] : ['bronze'])
    : attr ? Array.from({ length: Math.max(0, d.caps[attr.index] - d.final[attr.index]) }, (_, k) => d.final[attr.index] + 1 + k) : [];
  const lvl = level || (goal ? levels[0] : attr ? levels[Math.min(levels.length - 1, 4)] : '');
  const wantText = goal ? `${goal.label ?? label(goal.name)}${multi ? ' ' + label(lvl) : ''}` : attr ? `${name(attr.name)} ${lvl}` : '';
  async function run() {
    pool.cancel(); setOpen(true);
    const mine = pool.token.current, live = () => mine === pool.token.current;
    const held = {}, key = {};
    for (const g of goals) { const t = badgeTier(g, d.final, h); if (!t) continue; held[g.name] = t;
      if (valueOf(prefs, g) >= 2 || (!goals.some(x => valueOf(prefs, x) >= 2) && metaOf(g, build.body.position) >= 2)) key[g.name] = t; }
    const base = optimizerOptions(prefs, { ...labCfg, from: null, mustHave: {}, breakers: { general: Math.max(build.budget, d.generalUsed), future: 0, special: { category: build.category } } });
    const minimums = base.minimums.map((m, i) => Math.min(m, d.final[i], d.caps[i]));
    const add = must => {
      const mustHave = { ...must };
      if (goal && tiers.indexOf(mustHave[goal.name]) < tiers.indexOf(lvl)) mustHave[goal.name] = lvl;
      return { ...base, mustHave, minimums: minimums.map((m, i) => attr && i === attr.index ? Math.max(m, Number(lvl)) : m) };
    };
    const ways = [
      { id: 'all', label: 'Keep every badge', blurb: 'Everything you have stays; the rest is re-planned around it.', o: add(held) },
      { id: 'key', label: 'Keep the key ones', blurb: `Keeps ${Object.keys(key).length} badge tier${Object.keys(key).length === 1 ? '' : 's'} you care most about (Key/Core, or top meta); others may go.`, o: add(key) },
      { id: 'fresh', label: 'Built around it', blurb: 'Only this as a must; your Lab settings and the meta decide the rest.', o: add({}) },
    ];
    // Give up one thing: everything else stays, one badge you hold steps down a tier (or goes, if bronze). Tried for the
    // badges worth least to you and the meta, so you see several trades side by side (e.g. O-board vs. speed vs. a shooting tier).
    const worth = g => valueOf(prefs, g) + metaOf(g, build.body.position);
    const drops = goals.filter(g => held[g.name] && g.name !== goal?.name && g.tiers.some(t => t.requirements.length))
      .sort((a, b) => worth(a) - worth(b)).slice(0, 10);
    for (const g of drops) {
      const t = held[g.name], k = tiers.indexOf(t), keep = { ...held };
      if (k > 0) keep[g.name] = tiers[k - 1]; else delete keep[g.name];
      ways.push({ id: 'drop-' + g.name, drop: true, label: `Give up ${g.label ?? label(g.name)} ${k > 0 ? `${label(t)} → ${label(tiers[k - 1])}` : label(t)}`,
        blurb: 'Every other badge stays.', o: add(keep) });
    }
    setState({ running: true, started: performance.now(), want: wantText });
    const out = await pool.runJobs(ways.map(w => ({ kind: 'body', options: { body: build.body, opts: w.o } })),
      (done, total) => live() && setState(s => ({ ...s, progress: { done, total } })));
    if (!live()) return;
    const all = ways.map((w, k) => out[k] && !out[k].error ? { ...w, plan: out[k], pd: derivedOf(build, out[k]) }
      : { ...w, error: w.id === 'all' ? `Can't add it and keep every badge on this body.` : out[k]?.error ?? 'Could not finish.' });
    // Trades: only the ones that work, best first (meta + picks), and only if they really get it.
    const gets = x => !x.error && (goal ? tiers.indexOf(badgeTier(goal, x.pd.final, h)) >= tiers.indexOf(lvl) : x.pd.final[attr.index] >= Number(lvl));
    const score = x => x.plan.value + metaScore(x.pd.final, h, build.body.position) / 10;
    const trades = all.filter(x => x.drop && gets(x)).sort((a, b) => score(b) - score(a)).slice(0, 6);
    setState({ running: false, want: wantText, list: mergeSame(all.filter(x => !x.drop)), trades: mergeSame(trades) });
  }
  const use = (p, way) => { setBuild({ base: p.manual, breakers: p.breakers }, `Want ${state.want}: ${way}`); setOpen(false); notify(`Applied: ${state.want}. Ctrl+Z to undo.`); };
  return <section className="card">
    <div className="row-head"><h3>I want this</h3></div>
    {!what ? <WantSearch d={d} h={h} onPick={v => { setWhat(v); setLevel(''); }} />
      : <div className="want-chosen">
        <span className="chip want-target"><b>{goal ? (goal.label ?? label(goal.name)) : name(attr.name)}</b>
          <span className="muted small">{goal ? (have ? `you have ${multi ? label(have) : 'it'}` : 'you don’t have it') : `now ${have}`}</span>
          <button className="linkish" aria-label="Pick something else" onClick={() => { setWhat(''); setLevel(''); }}>×</button></span>
        {goal && multi && levels.length > 0 && <div className="seg small-seg" role="group" aria-label="Tier">{levels.map(t =>
          <button key={t} className={lvl === t ? 'on' : ''} aria-pressed={lvl === t} onClick={() => setLevel(t)}>{label(t)}</button>)}</div>}
        {attr && levels.length > 0 && <label className="field compact narrow"><span>To</span>
          <NumberInput title="Target rating" value={Number(lvl)} min={levels[0]} max={levels[levels.length - 1]} onChange={v => setLevel(String(v))} /></label>}
        <button className="mini-btn primary" disabled={!levels.length || state.running} onClick={run}>Find ways</button>
        <button className="mini-btn" disabled={!levels.length} title="New Lab search with this as a must-have, on this body and its neighbours"
          onClick={() => onWantInLab?.(build, goal ? { goal: goal.name, tier: lvl } : { attr: attr.name, value: Number(lvl) })}>Search the Lab</button>
      </div>}
    {what && !levels.length && <p className="muted small">{goal ? 'You already have its top tier.' : 'Already at this body’s cap.'}</p>}
    {!what && <p className="muted small">Ways to get one more thing on this body: keep everything, keep the key badges, build around it — or give up one badge tier, with several trades side by side.</p>}
    {open && <Modal wide title={`I want ${state.want ?? wantText}`} onClose={() => setOpen(false)}>
      {state.running && <p className="status-line"><span className="spinner" />Finding ways… {state.progress ? `${state.progress.done}/${state.progress.total}` : ''} <Elapsed started={state.started} /></p>}
      {state.list && <div className="quick-list">{state.list.map(x => x.error
        ? <article key={x.id} className="quick-card"><b>{x.label}</b><span className="muted small">{x.error}</span></article>
        : <QuickCard key={x.id} d={x.pd} from={d} title={x.label} blurb={x.blurb + (x.also ? ` Same build as: ${x.also.join(', ')}.` : '')}
          onApply={() => use(x.plan, x.label)} />)}</div>}
      {state.trades && <>
        <h4 className="quick-section">Or give up one thing <span className="muted small">— everything else stays; best trades first</span></h4>
        {state.trades.length ? <div className="quick-list">{state.trades.map(x => <QuickCard key={x.id} d={x.pd} from={d} title={x.label}
          blurb={x.blurb + (x.also ? ` Same build as: ${x.also.join(', ')}.` : '')} onApply={() => use(x.plan, x.label)} />)}</div>
          : <p className="muted small">No single step down gets it on this body: it needs more than one trade (see the options above).</p>}
      </>}
    </Modal>}
  </section>;
}

// Every change, newest first, with save points. Click one to compare it with the build you have; go back to any of them.
function HistoryDialog({ d, history, setHistory, onRevert, onCheckpoint, onClose }) {
  const [openId, setOpenId] = useState(history[0]?.id ?? null);
  const [name_, setName] = useState('');
  const ago = t => { const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
  return <Modal wide title="History" onClose={onClose}>
    <div className="history-save"><input type="text" placeholder="Save point name (optional)" value={name_} maxLength={60} onChange={e => setName(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { onCheckpoint(name_.trim()); setName(''); } }} />
      <button className="mini-btn primary" onClick={() => { onCheckpoint(name_.trim()); setName(''); }}>＋ Save point</button>
      <span className="muted small">Changes are kept in this browser; save points stay until you remove them.</span></div>
    {!history.length && <p className="muted small">Nothing yet. Changes like Maximize badges, Trim, Optimize and your edits show up here.</p>}
    <ul className="history-list">{history.map(e => {
      const ed = derive(e.build), diff = sumDiff(ed, d);
      return <li key={e.id} className={(e.pinned ? 'pinned ' : '') + (openId === e.id ? 'open' : '')}>
        <button className="history-head" aria-expanded={openId === e.id} onClick={() => setOpenId(openId === e.id ? null : e.id)}>
          <span>{e.pinned ? '★ ' : ''}<b>{e.label}</b></span>
          <small className="muted">{ago(e.at)} · {ed.finalName ?? 'Unnamed'} · {ed.unlocked.length} badges · {diff ? `${diff} rating pts from now` : 'same as now'}</small></button>
        {openId === e.id && <QuickCard d={ed} from={d} title={diff ? 'Compared with now' : 'Same ratings as now'} onApply={() => onRevert(e)}
          applyLabel="Go back to this" disabled={false}>
          <div className="history-actions">
            <button className="mini-btn" onClick={() => setHistory(h => h.map(x => x.id === e.id ? { ...x, pinned: !x.pinned } : x))}>{e.pinned ? 'Unpin' : '★ Keep as save point'}</button>
            <button className="mini-btn danger" onClick={() => setHistory(h => h.filter(x => x.id !== e.id))}>Remove</button></div>
        </QuickCard>}
      </li>;
    })}</ul>
  </Modal>;
}

// Type-ahead for "I want this": badges, contact dunks and ratings in one search, grouped, with what you have now.
function WantSearch({ d, h, onPick }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const items = useMemo(() => [
    ...goals.filter(g => inHeight(g, h)).map(g => ({ v: 'g:' + g.name, text: g.label ?? label(g.name), kind: g.discipline === 'animation' ? 'Dunk package' : 'Badge',
      note: badgeTier(g, d.final, h) ? (g.tiers.length > 1 ? `have ${label(badgeTier(g, d.final, h))}` : 'have it') : 'locked' })),
    ...attributes.map(a => ({ v: 'a:' + a.name, text: name(a.name), kind: 'Rating', note: `${d.final[a.index]} / cap ${d.caps[a.index]}` })),
  ], [d, h]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? items.filter(x => words.every(w => `${x.text} ${x.kind}`.toLowerCase().includes(w))).slice(0, 10) : [];
  return <div className="combo">
    <input type="search" role="combobox" aria-expanded={hits.length > 0} placeholder="Search a badge, dunk package or rating…" value={q}
      onChange={e => { setQ(e.target.value); setActive(0); }}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
        if (e.key === 'Enter' && hits[active]) { e.preventDefault(); onPick(hits[active].v); }
      }} />
    {hits.length > 0 && <ul role="listbox" className="combo-list">{hits.map((x, k) => <li key={x.v} role="option" aria-selected={k === active}
      className={k === active ? 'active' : ''} onMouseEnter={() => setActive(k)} onMouseDown={e => { e.preventDefault(); onPick(x.v); }}>
      <b>{x.text}</b> <span className="muted">{x.kind}</span><small>{x.note}</small></li>)}</ul>}
  </div>;
}
