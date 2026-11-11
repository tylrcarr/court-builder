import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { assess, attributes, badges, badgeTier, capsFor, defaultBody, empty, feet, inHeight, ladder, lowerLinkedRatings, name, positions, resolveLinks, tiers } from './engine.js';
import { buildName, reportedBuildName } from './build-name.js';
import './style.css';

const groups = [...new Set(attributes.map(attr => attr.discipline))];
const zeros = () => attributes.map(() => 0);
const label = key => key === 'hall_of_fame' ? 'Hall of Fame' : name(key);
const choose = (values, index, value) => values.map((old, i) => i === index ? value : old);
const integer = (value, low, high) => Math.max(low, Math.min(high, Math.trunc(Number(value)) || 0));

function Select({ title, value, options, onChange, stepper = false }) {
  const selected = options.findIndex(([key]) => String(key) === String(value));
  return <label>{title}<div className={stepper ? 'frame-stepper' : undefined}>{stepper && <button type="button" aria-label={'Decrease ' + title} disabled={selected <= 0} onClick={() => onChange(String(options[selected - 1][0]))}>−</button>}<select aria-label={title} value={value} onChange={event => onChange(event.target.value)}>
    {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
  </select>{stepper && <button type="button" aria-label={'Increase ' + title} disabled={selected >= options.length - 1} onClick={() => onChange(String(options[selected + 1][0]))}>+</button>}</div></label>;
}

function Rating({ title, value, max = 99, min = 25, onChange }) {
  const [draft, setDraft] = useState(String(value));
  useLayoutEffect(() => setDraft(String(value)), [value]);
  return <input aria-label={title} type="number" min={min} max={max} value={draft}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const next = draft === '' ? value : integer(draft, min, max);
      const accepted = onChange(next);
      setDraft(String(accepted === false ? value : next));
    }}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

const storageKey = 'court-builder.build.v1';
const libraryKey = 'court-builder.saved-builds.v1';

function isBuild(saved) {
  const body = saved?.body;
  const row = positions[body?.position]?.find(item => item.height === body.height);
  const isVector = (values, min, max) => Array.isArray(values) && values.length === attributes.length &&
    values.every(value => Number.isInteger(value) && value >= min && value <= max);
  return row && Number.isInteger(body.weight) && Number.isInteger(body.wingspan) &&
    body.weight >= row.minWeight && body.weight <= row.maxWeight &&
    body.wingspan >= row.minWingspan && body.wingspan <= row.maxWingspan &&
    isVector(saved.base, 25, 99) && isVector(saved.breakers, 0, 5);
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function restoreBuild() {
  const saved = readStorage(storageKey);
  return isBuild(saved) ? saved : { body: defaultBody(), base: empty(), breakers: zeros() };
}

function restoreLibrary() {
  const saved = readStorage(libraryKey);
  return Array.isArray(saved) ? saved.filter(item =>
    typeof item?.id === 'string' && typeof item.title === 'string' && isBuild(item)) : [];
}
function App() {
  const [saved] = useState(restoreBuild);
  const [library, setLibrary] = useState(restoreLibrary);
  const [buildTitle, setBuildTitle] = useState('');
  const [body, setBody] = useState(saved.body);
  const [base, setBase] = useState(saved.base);
  const [breakers, setBreakers] = useState(saved.breakers);
  const [goals, setGoals] = useState(empty);
  const [badgeGoals, setBadgeGoals] = useState({});
  const [budget, setBudget] = useState(saved.budget ?? 8);
  const [category, setCategory] = useState(saved.category ?? '');
  const [specialCount, setSpecialCount] = useState(saved.specialCount ?? 2);
  const [showBreakers, setShowBreakers] = useState(true);
  const [view, setView] = useState('builder');
  const [message, setMessage] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [search, setSearch] = useState(null);
  const [searchFrames, setSearchFrames] = useState(false);
  const [running, setRunning] = useState(false);
  const worker = useRef(null);
  const caps = useMemo(() => capsFor(body), [body]);
  const ratings = useMemo(() => resolveLinks(base, body.height), [base, body.height]);
  const state = assess(ratings, body.height, caps);
  const archetype = useMemo(() => buildName(body.position, ratings), [body.position, ratings]);
  const linkedFloors = ratings.map((_, i) => resolveLinks(choose(base, i, 25), body.height)[i]);
  const canIncrease = ratings.map((rating, i) => rating < caps[i] &&
    assess(resolveLinks(choose(base, i, rating + 1), body.height), body.height, caps).fits);
  const canUpgrade = canIncrease.some(Boolean);
  const shownOverall = Math.max(25, Math.min(canUpgrade ? 98 : 99,
    canUpgrade ? Math.floor(state.score + 1e-6) : 99));
  const ladders = ratings.map((rating, i) => ladder(i, rating, caps[i], body.height, state.playerType));
  const appliedCounts = breakers.map((used, i) => Math.min(used, ladders[i].filter(Boolean).length));
  const final = ratings.map((rating, i) => rating + ladders[i].slice(0, appliedCounts[i]).reduce((sum, gain) => sum + gain, 0));
  const count = appliedCounts.reduce((sum, used) => sum + used, 0);
  const finalArchetype = count ? buildName(body.position, final) : archetype;
  const hasReportedName = Boolean(reportedBuildName(body.position, count ? final : ratings));
  const restrictedUsed = category ? Math.min(specialCount, appliedCounts.reduce((sum, used, i) =>
    sum + (attributes[i].discipline === category || attributes[i].name === 'free_throw' ? used : 0), 0)) : 0;
  const row = positions[body.position].find(option => option.height === body.height);
  const eligibleBadges = badges.filter(badge => inHeight(badge, body.height));
  const unlocked = eligibleBadges.map(badge => [badge, badgeTier(badge, final, body.height)]).filter(([, tier]) => tier);
  const optionRange = (min, max, display) => Array.from({ length: max - min + 1 }, (_, i) => [min + i, display(min + i)]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ body, base, breakers, budget, category, specialCount }));
    } catch {
      // The builder remains usable when browser storage is unavailable.
    }
  }, [body, base, breakers, budget, category, specialCount]);
  const exportText = [
    'NBA 2K27 MyPLAYER build',
    'Predicted build name: ' + (archetype ?? 'Unavailable'),
    ...(count ? ['Predicted name after Cap Breakers: ' + (finalArchetype ?? 'Unavailable')] : []),
    ...(hasReportedName ? ['Name source: user-confirmed in-game observation for this exact rating spread'] : []),
    body.position + ' | ' + feet(body.height) + ' (' + body.height + ' in) | ' + body.weight + ' lb | Wingspan ' + feet(body.wingspan) + ' (' + body.wingspan + ' in)',
    'Builder Overall: ' + shownOverall + ' | General breakers: ' + budget +
      ' | Specialization: ' + (category ? name(category) + ' (' + specialCount + ')' : 'None'),
    'Cap Breakers selected: ' + count + ' total | ' + (count - restrictedUsed) + '/' + budget +
      ' general | ' + restrictedUsed + '/' + (category ? specialCount : 0) + ' specialized' +
      (count - restrictedUsed > budget ? ' | Over budget' : ''),
    'Attribute | Potential | Build Max | Breaker gains (steps 1–5) | Selected | Final | Cap Max (5 breakers)',
    ...attributes.map(({ index: i, name: key }) =>
      [name(key), ratings[i], caps[i], ladders[i].map(gain => '+' + gain).join(' '), appliedCounts[i], final[i], ratings[i] + ladders[i].reduce((sum, gain) => sum + gain, 0)].join(' | ')),
  ].join('\n');
  function clearSearch() {
    worker.current?.terminate();
    setRunning(false);
    setSearch(null);
  }

  function changePosition(position) {
    const limits = positions[position].find(option => option.height === body.height);
    const valid = limits && body.weight >= limits.minWeight && body.weight <= limits.maxWeight &&
      body.wingspan >= limits.minWingspan && body.wingspan <= limits.maxWingspan;
    if (valid) {
      setBody({ ...body, position });
      clearSearch();
      setMessage('Position changed to ' + position + '.');
      return;
    }
    updateBody(defaultBody(position, body.height));
  }
  function changeHeight(height) {
    const limits = positions[body.position].find(option => option.height === height);
    updateBody({
      ...body, height,
      weight: integer(body.weight, limits.minWeight, limits.maxWeight),
      wingspan: integer(body.wingspan, limits.minWingspan, limits.maxWingspan),
    });
  }

  function updateBody(next) {
    const caps = capsFor(next);
    let adjusted = resolveLinks(ratings, next.height);
    // Lower ratings above the new ceilings and propagate reductions through links.
    for (let i = 0; i < caps.length; i++) {
      if (adjusted[i] > caps[i]) {
        adjusted = resolveLinks(lowerLinkedRatings(adjusted, next.height, i, caps[i]), next.height);
      }
    }
    setBody(next);
    setBase(adjusted);
    setMessage('Frame updated. Ratings adjusted where the new frame requires it.');
    clearSearch();
  }

  function saveBuild(startNew = false) {
    const title = buildTitle.trim() || (archetype ?? 'MyPLAYER') + ' · ' + body.position + ' ' + feet(body.height);
    const snapshot = { id: crypto.randomUUID(), title, body, base, breakers, budget, category, specialCount, overall: shownOverall };
    const next = [snapshot, ...restoreLibrary()];
    try {
      localStorage.setItem(libraryKey, JSON.stringify(next));
    } catch {
      setMessage('Could not save this build in browser storage.');
      return;
    }
    setLibrary(next);
    setBuildTitle('');
    if (startNew) {
      setBody(defaultBody());
      setBase(empty());
      setBreakers(zeros());
      clearSearch();
      setGoals(empty());
      setBadgeGoals({});
    }
    setMessage(startNew ? 'Saved ' + title + '. Started a new build.' : 'Saved ' + title + '.');
  }

  function loadBuild(snapshot) {
    setBody(snapshot.body);
    setBase(snapshot.base);
    setBreakers(snapshot.breakers);
    setBudget(snapshot.budget ?? 8);
    setCategory(snapshot.category ?? '');
    setSpecialCount(snapshot.specialCount ?? 2);
    clearSearch();
    setMessage('Loaded ' + snapshot.title + '.');
  }
  function setRating(index, value) {
    if (ratings[index] === value) return;
    let next = value < linkedFloors[index]
      ? lowerLinkedRatings(base, body.height, index, value)
      : choose(base, index, value);
    let trial = assess(resolveLinks(next, body.height), body.height, caps);
    const blocked = !trial.fits;
    while (!trial.fits && value > ratings[index]) {
      value--;
      next = choose(base, index, value);
      trial = assess(resolveLinks(next, body.height), body.height, caps);
    }
    const canLower = value < ratings[index] && trial.withinCaps && trial.score <= state.score + 1e-8;
    if ((trial.fits || canLower) && value !== ratings[index]) setBase(next);
    setMessage(blocked ? 'This attribute has reached its limit for the current build.' : '');
    return !blocked || canLower;
  }

  function runSearch() {
    const selected = badges.filter(badge => badgeGoals[badge.badge]).map(badge => ({
      badge, tier: badgeGoals[badge.badge],
    }));
    if (!selected.length && goals.every(goal => goal === 25)) {
      setSearch({ error: 'Set an attribute target or a required badge tier first.' });
      return;
    }
    clearSearch();
    setRunning(true);
    const task = new Worker(new URL('./optimizer-worker.js', import.meta.url), { type: 'module' });
    worker.current = task;
    const finish = result => {
      setSearch(result);
      setRunning(false);
      task.terminate();
    };
    task.onmessage = event => finish(event.data);
    task.onerror = () => finish({ error: 'The optimizer could not complete this search.' });
    task.postMessage({ body, searchFrames, goals, badgeGoals: selected, budget,
      specialization: { category, count: category ? specialCount : 0 }, attributes });
  }

  function apply(plan) {
    const applied = zeros();
    plan.uses.forEach(use => applied[use.index]++);
    setBody(plan.body);
    setBase(plan.seed);
    setBreakers(applied);
    setMessage('Plan loaded. Verify the base ratings and breaker gains in 2K HQ.');
    setView('builder');
  }

  return <div className="shell">
    <header><div className="mark">CB</div><div><div className="wordmark">COURT BUILDER</div>
      <div className="subhead">NBA 2K27 · MYPLAYER WORKBENCH</div></div><span className="status">RULES BETA</span></header>
    <main>
      <section className="hero">
        <div><div className="eyebrow">NBA 2K27 / MYCAREER</div><h1>MyPLAYER Builder</h1>
          <p>Set your build’s potential. Distribute your attributes up to 99 Overall.</p><div className="build-name"><span>{hasReportedName ? 'In-game name (reported)' : count ? 'Predicted name after Cap Breakers' : 'Predicted build name'}</span><strong>{finalArchetype ?? 'Unavailable'}</strong>{count > 0 && <small>Base build: {archetype ?? 'Unavailable'}</small>}</div></div>
        <div className="overall" aria-label={shownOverall + ' Overall'}>
          <span>OVERALL</span><strong>{shownOverall}</strong><span>MAX 99</span>
          <progress aria-label="Progress to 99 Overall" value={shownOverall - 25} max={74} />
        </div>
      </section>
      <section className="controls card">
        <Select title="Position" value={body.position} options={Object.keys(positions).map(pos => [pos, pos])}
          onChange={changePosition} />
        <Select stepper title="Height" value={body.height} options={positions[body.position].map(item => [item.height, feet(item.height)])}
          onChange={height => changeHeight(Number(height))} />
        <Select stepper title="Weight" value={body.weight} options={optionRange(row.minWeight, row.maxWeight, value => value + ' lb')}
          onChange={weight => updateBody({ ...body, weight: Number(weight) })} />
        <Select stepper title="Wingspan" value={body.wingspan} options={optionRange(row.minWingspan, row.maxWingspan, feet)}
          onChange={wingspan => updateBody({ ...body, wingspan: Number(wingspan) })} />
      </section>
      <nav aria-label="Workbench">
        <button className={view === 'builder' ? 'selected' : ''} onClick={() => setView('builder')}>Builder</button>
        <button className={view === 'optimizer' ? 'selected' : ''} onClick={() => setView('optimizer')}>Optimizer</button>
        <button className={view === 'badges' ? 'selected' : ''} onClick={() => setView('badges')}>Badges <span>{unlocked.length}</span></button>
      </nav>
      <section className="card panel breaker-settings pool-strip">
            <div className="eyebrow">CAP BREAKER POOL</div><h2>{count} applied</h2>
            <label>General breakers<Rating title="General breakers" value={budget} min={0} max={105}
              onChange={value => { if (value !== budget) { setBudget(value); clearSearch(); } }} /></label>
            <Select title="Specialization" value={category} options={[[ '', 'None'], ...groups.map(group => [group, name(group)])]}
              onChange={value => { setCategory(value); clearSearch(); }} />
            {category && <label>Specialized breakers<Rating title="Specialized breakers" value={specialCount} min={0} max={30}
              onChange={value => { if (value !== specialCount) { setSpecialCount(value); clearSearch(); } }} /></label>}
            <small className={count - restrictedUsed > budget ? 'warn' : ''}>{count - restrictedUsed}/{budget} general used · {restrictedUsed}/{category ? specialCount : 0} specialized used</small>
          </section>
      <div className="workspace">
        <div>
          {view === 'builder' && <section className="card panel">
            <div className="panel-head"><div><div className="eyebrow">SET YOUR POTENTIAL</div><h2>Attributes</h2></div>
              <div className="builder-actions"><button aria-expanded={showExport} onClick={() => { setShowExport(!showExport); setCopyStatus(''); }}>Export Build</button><button aria-pressed={showBreakers} onClick={() => setShowBreakers(!showBreakers)}>{showBreakers ? 'Hide' : 'Show'} Cap Breaker Preview</button><button onClick={() => { setBase(empty()); setBreakers(zeros()); setMessage('Build cleared.'); }}>Clear Build</button></div></div>
            <p className="muted">Linked ratings move together. Select a Cap Breaker step to preview your new rating.</p>
            <section className="saved-builds" aria-label="Saved builds">
              <div className="save-build-controls">
                <input type="text" aria-label="Build name for saving" placeholder="Name this build (optional)"
                  maxLength={80} value={buildTitle} onChange={event => setBuildTitle(event.target.value)} />
                <button type="button" onClick={() => saveBuild()}>Save Build</button>
                <button type="button" onClick={() => saveBuild(true)}>Save &amp; New</button>
              </div>
              <details>
                <summary>Saved builds ({library.length})</summary>
                {library.length ? <ul>{library.map(item => <li key={item.id}>
                  <span><strong>{item.title}</strong><small>{item.body.position} · {feet(item.body.height)} · {item.body.weight} lb · {item.overall} OVR</small></span>
                  <button type="button" onClick={() => loadBuild(item)}>Load build</button>
                </li>)}</ul> : <p className="muted">Saved builds will appear here.</p>}
              </details>
            </section>
            {showExport && <div className="build-export">
              <label htmlFor="build-export">Build export</label>
              <textarea id="build-export" rows={8} readOnly value={exportText} onFocus={event => event.target.select()} />
              <button onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportText);
                  setCopyStatus('Copied.');
                } catch {
                  document.getElementById('build-export')?.focus();
                  setCopyStatus('Press Ctrl+C to copy the selected text.');
                }
              }}>Copy text</button>
              <span role="status">{copyStatus}</span>
            </div>}
            <div aria-live="polite" className="message">{message}{!state.fits && <p>These ratings exceed this frame’s 99 Overall limit. Lower ratings to continue.</p>}</div>
            <div className={showBreakers ? 'attribute-head preview-open' : 'attribute-head'}><span>Attribute</span><span>Potential</span>{showBreakers && <span>Cap Breaker Preview</span>}<span>Final</span><span title="Maximum from this potential with five Cap Breakers">Cap Max</span><span title="Attribute ceiling for this body">Build Max</span></div>
            {groups.map(group => <div key={group}>
              <h3 className="group">{name(group)}</h3>
              {attributes.filter(attr => attr.discipline === group).map(({ index: i, name: key }) => (
                <div className={showBreakers ? 'attribute preview-open' : 'attribute'} key={key}>
                  <div>{name(key)}{linkedFloors[i] > 25 && <small>Linked minimum {linkedFloors[i]}</small>}</div>
                  <div className="potential">
                    <input type="range" aria-label={name(key) + ' potential slider'} min={25} max={caps[i]}
                      value={ratings[i]} disabled={caps[i] === 25}
                      style={{ '--fill': ((ratings[i] - 25) / Math.max(1, caps[i] - 25) * 100) + '%' }}
                      onChange={event => setRating(i, Number(event.target.value))} />
                    <button className="rating-step" type="button" aria-label={'Decrease ' + name(key) + ' by 1'} disabled={ratings[i] <= 25} onClick={() => setRating(i, ratings[i] - 1)}>−</button>
                    <Rating title={name(key) + ' potential'} value={ratings[i]} max={caps[i]}
                      onChange={value => setRating(i, value)} />
                    <button className="rating-step" type="button" aria-label={'Increase ' + name(key) + ' by 1'} disabled={!canIncrease[i]} title={!canIncrease[i] ? 'This attribute cannot increase on the current build' : undefined} onClick={() => setRating(i, ratings[i] + 1)}>+</button>
                  </div>
                  {showBreakers && <div className="breaker-steps" role="group" aria-label={name(key) + ' Cap Breaker Preview'}>
                    {ladders[i].map((gain, step) => <button key={step} type="button" disabled={!gain}
                      className={step < appliedCounts[i] ? 'applied-step' : ''}
                      aria-label={name(key) + ' breaker ' + (step + 1) + ', gain ' + gain}
                      aria-pressed={step < appliedCounts[i]}
                      onClick={() => setBreakers(choose(breakers, i, appliedCounts[i] === step + 1 ? 0 : step + 1))}>
                      {gain ? '+' + gain : '–'}</button>)}
                  </div>}
                  <strong className={final[i] > ratings[i] ? 'lime' : ''}>{final[i]}</strong>
                  <span className="breaker-max" aria-label={name(key) + ' cap max'}>{ratings[i] + ladders[i].reduce((sum, gain) => sum + gain, 0)}</span><span className="body-max" aria-label={name(key) + ' build max'}>{caps[i]}</span>
                </div>
              ))}
            </div>)}
          </section>}
          {view === 'optimizer' && <section className="card panel">
            <div className="eyebrow">02 / BUILD SEARCH</div><h2>Target optimizer</h2>
            <p className="muted">Find starting ratings and a breaker plan that reaches your targets. Plans with room left let you put more points into other attributes.</p>
            <div className="targets">{attributes.map(({ index, name: key }) => <label key={key}>{name(key)}
              <Rating title={name(key) + ' target'} value={goals[index]} onChange={value => {
                if (value !== goals[index]) { setGoals(choose(goals, index, value)); clearSearch(); }
              }} /></label>)}</div>
            <h3>Required badges</h3>
            <div className="badge-goals">{eligibleBadges.map(badge => <Select key={badge.badge} title={label(badge.name)}
              value={badgeGoals[badge.badge] ?? ''} options={[[ '', 'Optional'], ...tiers.map(tier => [tier, label(tier)])]}
              onChange={value => { setBadgeGoals({ ...badgeGoals, [badge.badge]: value }); clearSearch(); }} />)}</div>
            {badges.some(badge => badgeGoals[badge.badge] && !inHeight(badge, body.height)) &&
              <button onClick={() => { setBadgeGoals(Object.fromEntries(eligibleBadges.map(badge => [badge.badge, badgeGoals[badge.badge]]))); clearSearch(); }}>Clear badge targets outside this height</button>}
            <label className="frame-toggle"><input type="checkbox" checked={searchFrames} onChange={event => { setSearchFrames(event.target.checked); clearSearch(); }} /> Compare sample frames at this position</label>
            <button className="primary" disabled={running} onClick={runSearch}>{running ? 'Searching…' : 'Find plans'}</button>
            <div aria-live="polite">{search?.error && <p className="warn">{search.error}</p>}
              {search?.results && <p className="muted">{search.checked.toLocaleString()} candidates checked across {search.frames} {search.frames === 1 ? 'frame' : 'frames'}. {search.results.length ? 'Open a plan to inspect all ratings.' : 'No plan found for this frame and budget in this search.'}</p>}</div>
            {search?.results?.map((plan, i) => <article className="plan" key={plan.base.join(',')}>
              <div><strong>{i === 0 ? 'Most room for upgrades' : 'Plan ' + (i + 1)}</strong><small>{feet(plan.body.height)} · {plan.body.weight} lb · {feet(plan.body.wingspan)} wingspan · {plan.general} general · {plan.specialized} specialized</small></div>
              <button onClick={() => apply(plan)}>Open plan</button>
              <p>{plan.uses.length ? attributes.filter(attr => plan.uses.some(use => use.index === attr.index)).map(attr =>
                name(attr.name) + ' ' + plan.base[attr.index] + ' → ' + plan.final[attr.index]).join(' · ') : 'Targets reached with base ratings.'}</p>
            </article>)}
          </section>}
          {view === 'badges' && <section className="card panel">
            <div className="eyebrow">03 / BADGE QUALIFICATION</div><h2>Badge requirements</h2>
            <p className="muted">Qualification uses your final ratings and height. Badge token spending is separate.</p>
            {badges.map(badge => <details key={badge.badge}>
              <summary>{label(badge.name)} <span>{!inHeight(badge, body.height) ? 'Height restricted' :
                label(badgeTier(badge, final, body.height) ?? 'locked')}</span></summary>
              {badge.tiers.map(tier => <p key={tier.tier}><b>{label(tier.tier)}</b> {tier.requirements.map((req, i) =>
                (i ? ' ' + tier.requirements[i - 1].operator_to_next + ' ' : '') +
                name(attributes[req.attribute].name) + ' ' + req.minimum).join('') || 'No rating requirement'}</p>)}
            </details>)}
          </section>}
        </div>

      </div>
    </main><footer>COURT BUILDER · Independent NBA 2K27 planning tool</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
















