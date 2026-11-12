import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RENAMED } from './animations.js';
import { createRoot } from 'react-dom/client';
import { attributes, badges, defaultBody, empty, feet, positions } from './engine.js';
import { decodeBuild, shareUrl } from './share.js';
import { derive, zeros } from './derive.js';
import { BodyLine, MiniRatings } from './ui/common.jsx';
import BuilderView from './ui/BuilderView.jsx';
import { MAX_SPECIALIZED, defaultPrefs } from './breakpoints.js';
import LabView, { defaultLab } from './ui/LabView.jsx';
import BadgesView from './ui/BadgesView.jsx';
import CompareView from './ui/CompareView.jsx';
import ExplorerView from './ui/ExplorerView.jsx';
import './style.css';

const KEYS = { build: 'court-builder.build.v2', library: 'court-builder.saved-builds.v1', lab: 'court-builder.lab.v3',
  compare: 'court-builder.compare.v1', prefs: 'court-builder.prefs.v3', searches: 'court-builder.searches.v1' };
const VIEWS = [
  ['builder', 'Builder', 'Hand-tune a build'], ['lab', 'Build Lab', 'Badge-first optimizer across bodies'],
  ['reference', 'Reference', 'Badge requirements and body caps'], ['compare', 'Compare', 'Side by side'], ['saved', 'Saved', 'Your library'],
];

// Saved Lab prefs/searches from before the contact-dunk table was split keep their picks under the new names.
const migrate = raw => raw && Object.entries(RENAMED).reduce((s, [from, to]) => s.replaceAll(`"${from}"`, `"${to}"`), raw);
const read = (key, fallback) => { try { return JSON.parse(migrate(localStorage.getItem(key))) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

function validBuild(b) {
  const row = positions[b?.body?.position]?.find(r => r.height === b.body.height);
  const vec = (v, lo, hi) => Array.isArray(v) && v.length === attributes.length && v.every(x => Number.isInteger(x) && x >= lo && x <= hi);
  return row && b.body.weight >= row.minWeight && b.body.weight <= row.maxWeight && b.body.wingspan >= row.minWingspan
    && b.body.wingspan <= row.maxWingspan && vec(b.base, 25, 99) && vec(b.breakers ?? zeros(), 0, 5);
}
const blank = () => ({ body: defaultBody(), base: empty(), breakers: zeros(), budget: 8, category: '', specialCount: 0 });
const fromResult = r => ({ body: r.body, base: r.manual ?? r.base, breakers: r.breakers ?? zeros(),
  budget: r.budget ?? r.generalUsed ?? 8, category: r.category ?? '', specialCount: (r.category ?? '') ? MAX_SPECIALIZED : 0, title: r.title,
  synergy: r.synergy ?? {},
  savedId: r.savedId ?? null });

function initialBuild() {
  const hash = location.hash.match(/#b=([^&]+)/);
  const shared = hash && decodeBuild(hash[1]);
  if (shared && validBuild(shared)) return shared;
  const saved = read(KEYS.build, null) ?? read('court-builder.build.v1', null);
  return validBuild(saved) ? { ...blank(), ...saved } : blank();
}

function App() {
  const [build, setBuildState] = useState(initialBuild);
  const [view, setView] = useState(() => { const v = location.hash.match(/#\/(\w+)/)?.[1]; return VIEWS.some(([id]) => id === v) ? v : 'builder'; });
  const [library, setLibrary] = useState(() => read(KEYS.library, []).filter(b => typeof b?.id === 'string' && validBuild(b)));
  const [lab, setLab] = useState(() => ({ ...defaultLab(), ...read(KEYS.lab, {}) }));
  const [compare, setCompare] = useState(() => read(KEYS.compare, []).filter(validBuild));
  const [prefs, setPrefs] = useState(() => ({ ...defaultPrefs(), ...read(KEYS.prefs, {}) }));
  const [searches, setSearches] = useState(() => read(KEYS.searches, []));
  const [refTab, setRefTab] = useState('badges');
  const [toast, setToast] = useState('');
  const d = useMemo(() => derive(build), [build]);

  useEffect(() => write(KEYS.build, build), [build]);
  useEffect(() => write(KEYS.library, library), [library]);
  useEffect(() => write(KEYS.lab, lab), [lab]);
  useEffect(() => write(KEYS.compare, compare), [compare]);
  useEffect(() => write(KEYS.prefs, prefs), [prefs]);
  useEffect(() => write(KEYS.searches, searches), [searches]);
  useEffect(() => { if (location.hash !== `#/${view}`) window.history.pushState(null, '', `#/${view}`); window.scrollTo({ top: 0 }); }, [view]);
  useEffect(() => {
    const onHash = () => {
      const shared = location.hash.match(/#b=([^&]+)/);
      if (shared) { const b = decodeBuild(shared[1]); if (b && validBuild(b)) { setBuildState(b); setView('builder'); notify('Opened shared build.'); } return; }
      const v = location.hash.match(/#\/(\w+)/)?.[1];
      if (v && VIEWS.some(([id]) => id === v)) setView(v);
    };
    window.addEventListener('hashchange', onHash); window.addEventListener('popstate', onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t); }, [toast]);

  const undoStack = useRef({ past: [], future: [] });
  const [, bump] = useState(0);
  const commit = next => setBuildState(b => {
    const value = typeof next === 'function' ? next(b) : next;
    if (value !== b) { undoStack.current.past = [...undoStack.current.past.slice(-99), b]; undoStack.current.future = []; bump(n => n + 1); }
    return value;
  });
  const setBuild = patch => commit(b => ({ ...b, ...patch }));
  const undo = () => setBuildState(b => { const h = undoStack.current; if (!h.past.length) return b;
    h.future = [b, ...h.future]; const prev = h.past[h.past.length - 1]; h.past = h.past.slice(0, -1); bump(n => n + 1); return prev; });
  const redo = () => setBuildState(b => { const h = undoStack.current; if (!h.future.length) return b;
    h.past = [...h.past, b]; const next = h.future[0]; h.future = h.future.slice(1); bump(n => n + 1); return next; });
  useEffect(() => {
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey) || /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  const notify = setToast;
  const open = r => { commit({ ...blank(), ...fromResult(r) }); setView('builder'); notify('Build loaded into the Builder. Ctrl+Z to go back.'); };
  const addCompare = r => { setCompare(c => [...c, { ...fromResult(r), title: r.title ?? derive(fromResult(r)).finalName }].slice(-4)); notify('Added to Compare.'); };
  // Saving a build that was opened from the library overwrites that entry; anything else is a new entry.
  const save = b => {
    const exists = !!b.savedId && library.some(x => x.id === b.savedId);
    const { savedId, ...rest } = fromResult(b);
    const item = { ...blank(), ...rest, id: exists ? savedId : crypto.randomUUID(),
      title: b.title ?? derive(fromResult(b)).finalName ?? 'Saved build', savedAt: Date.now() };
    setLibrary(l => exists ? l.map(x => x.id === item.id ? item : x) : [item, ...l]);
    notify(exists ? `Updated “${item.title}”.` : `Saved “${item.title}”.`);
    return item.id;
  };
  const findWith = (badge, tier) => {
    const key = badges.find(b => b.badge === badge)?.name;
    setLab(l => ({ ...l, mustHave: { ...l.mustHave, [key]: tier } })); setView('lab'); notify('Added as a must-have in the Lab.');
  };
  const sendToLab = b => {
    setLab(l => ({ ...l, from: { ...b }, keepBadges: true, positions: [b.body.position],
      heights: [b.body.height - 1, b.body.height + 1],
      breakers: { ...l.breakers, general: b.budget, special: { category: b.category } } }));
    setView('lab'); notify('Build sent to the Lab: its badges are kept as must-haves. Widen positions/heights to find similar bodies.');
  };
  // A new Lab search for exactly this build: every rating (after Cap Breakers) as a minimum, its body, its breaker count.
  // Replaces the Lab's musts, minimums and maximums (the minimums already hold every badge it has), then runs.
  const findExact = b => {
    const bd = derive(b);
    setPrefs(p => ({ ...p, minimums: Object.fromEntries(attributes.map((a, i) => [a.name, bd.final[i]]).filter(([, v]) => v > 25)), maximums: {} }));
    setLab(l => ({ ...l, from: null, keepBadges: false, mustHave: {}, positions: [b.body.position], heights: [b.body.height, b.body.height],
      breakers: { general: Math.max(b.budget ?? 0, bd.generalUsed), future: 0, special: { category: b.category } }, runNow: Date.now() }));
    setView('lab'); notify('Lab: every rating of this build is a minimum. Searching…');
  };

  return <div className="app">
    <header className="topbar">
      <div className="brand"><div className="logo">CB</div><div><b>COURT BUILDER</b><small>NBA 2K27 MyPLAYER lab</small></div></div>
      <nav aria-label="Views">{VIEWS.map(([id, text, hint]) => <button key={id} className={view === id ? 'on' : ''} title={hint}
        aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{text}
        {id === 'compare' && compare.length > 0 && <span className="count">{compare.length}</span>}
        {id === 'saved' && library.length > 0 && <span className="count">{library.length}</span>}</button>)}</nav>
      <button className="current" onClick={() => setView('builder')} title="Current build">
        <span>{d.finalName ?? 'Current build'}</span><small>{build.body.position} {feet(build.body.height)} · {d.unlocked.length} badges</small></button>
    </header>
    <main>
      {view === 'builder' && <BuilderView build={build} setBuild={setBuild} onSave={save} notify={notify} library={library}
        undo={undoStack.current.past.length ? undo : null} redo={undoStack.current.future.length ? redo : null}
        prefs={prefs} setPrefs={setPrefs} onSendToLab={sendToLab} onFindExact={findExact} labCfg={lab} />}
      {view === 'lab' && <LabView build={build} prefs={prefs} setPrefs={setPrefs} cfg={lab} setCfg={setLab} searches={searches}
        setSearches={setSearches} notify={notify} onOpen={open} onCompare={addCompare} onSave={save} />}
      {view === 'reference' && <>
        <div className="toggles ref-tabs" role="group" aria-label="Reference">
          <button className={refTab === 'badges' ? 'on' : ''} aria-pressed={refTab === 'badges'} onClick={() => setRefTab('badges')}>Badges</button>
          <button className={refTab === 'caps' ? 'on' : ''} aria-pressed={refTab === 'caps'} onClick={() => setRefTab('caps')}>Body caps</button>
        </div>
        {refTab === 'badges' ? <BadgesView build={build} onFindWith={findWith} />
          : <ExplorerView build={build} onUseBody={body => { setBuild({ body, base: empty(), breakers: zeros() }); setView('builder'); }} />}
      </>}
      {view === 'compare' && <CompareView items={compare} setItems={setCompare} build={build} library={library} onOpen={open} />}
      {view === 'saved' && <SavedView library={library} setLibrary={setLibrary} onOpen={open} onCompare={addCompare} notify={notify} />}
    </main>
    <footer className="foot">Court Builder · independent planning tool · rules from NBA 2K HQ tuning, verified against the HQ builder.
      Not affiliated with 2K.</footer>
    <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
  </div>;
}

function SavedView({ library, setLibrary, onOpen, onCompare, notify }) {
  const [query, setQuery] = useState('');
  const shown = library.filter(b => !query || b.title.toLowerCase().includes(query.toLowerCase()));
  const exportAll = () => {
    const blob = new Blob([JSON.stringify(library, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'court-builder-builds.json' });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = async file => {
    try {
      const items = JSON.parse(await file.text()).filter(validBuild).map(b => ({ ...b, id: crypto.randomUUID() }));
      setLibrary(l => [...items, ...l]); notify(`Imported ${items.length} builds.`);
    } catch { notify('That file is not a Court Builder export.'); }
  };
  return <div className="saved">
    <section className="card">
      <div className="card-head"><div><h2>Saved builds</h2><p className="muted">Stored in this browser. Export to back up or move them.</p></div>
        <div className="actions"><input type="search" placeholder="Filter…" value={query} onChange={e => setQuery(e.target.value)} />
          <button onClick={exportAll} disabled={!library.length}>Export JSON</button>
          <label className="button">Import JSON<input type="file" accept="application/json" hidden onChange={e => e.target.files[0] && importFile(e.target.files[0])} /></label></div></div>
      {!shown.length && <p className="muted">No saved builds yet. Save from the Builder or any search result.</p>}
      <div className="results">{shown.map(b => { const d = derive(b); return <article key={b.id} className="result">
        <header><div><h3 contentEditable suppressContentEditableWarning onBlur={e => {
          const title = e.currentTarget.textContent.trim(); if (title) setLibrary(l => l.map(x => x.id === b.id ? { ...x, title } : x)); }}>{b.title}</h3>
          <BodyLine body={b.body} /><small className="muted">{d.finalName} · {d.unlocked.length} badges</small></div></header>
        <MiniRatings final={d.final} caps={d.caps} />
        <footer><button className="primary" onClick={() => onOpen({ ...b, savedId: b.id })}>Open</button><button onClick={() => onCompare(b)}>Compare</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(shareUrl(b)); notify('Share link copied.'); } catch { prompt('Copy this link', shareUrl(b)); } }}>Share</button>
          <button className="danger" onClick={() => setLibrary(l => l.filter(x => x.id !== b.id))}>Delete</button></footer>
      </article>; })}</div>
    </section>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
