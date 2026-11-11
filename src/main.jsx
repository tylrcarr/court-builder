import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { attributes, defaultBody, empty, feet, positions } from './engine.js';
import { decodeBuild, shareUrl } from './share.js';
import { derive, zeros } from './ui/derive.js';
import { BodyLine, MiniRatings } from './ui/common.jsx';
import BuilderView from './ui/BuilderView.jsx';
import LabView, { defaultLab } from './ui/LabView.jsx';
import VibesView, { defaultVibes } from './ui/VibesView.jsx';
import SimilarView from './ui/SimilarView.jsx';
import BadgesView from './ui/BadgesView.jsx';
import CompareView from './ui/CompareView.jsx';
import ExplorerView from './ui/ExplorerView.jsx';
import './style.css';

const KEYS = { build: 'court-builder.build.v2', library: 'court-builder.saved-builds.v1', lab: 'court-builder.lab.v1',
  vibes: 'court-builder.vibes.v1', compare: 'court-builder.compare.v1' };
const VIEWS = [
  ['builder', 'Builder', 'Hand-tune a build'], ['lab', 'Build Lab', 'Optimize for badges'], ['vibes', 'Vibes', 'Describe a playstyle'],
  ['similar', 'Find Similar', 'Same strengths, new body'], ['badges', 'Badges', 'Requirements & tokens'],
  ['compare', 'Compare', 'Side by side'], ['explorer', 'Caps', 'How bodies move caps'], ['saved', 'Saved', 'Your library'],
];

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

function validBuild(b) {
  const row = positions[b?.body?.position]?.find(r => r.height === b.body.height);
  const vec = (v, lo, hi) => Array.isArray(v) && v.length === attributes.length && v.every(x => Number.isInteger(x) && x >= lo && x <= hi);
  return row && b.body.weight >= row.minWeight && b.body.weight <= row.maxWeight && b.body.wingspan >= row.minWingspan
    && b.body.wingspan <= row.maxWingspan && vec(b.base, 25, 99) && vec(b.breakers ?? zeros(), 0, 5);
}
const blank = () => ({ body: defaultBody(), base: empty(), breakers: zeros(), budget: 8, category: '', specialCount: 2 });
const fromResult = r => ({ body: r.body, base: r.manual ?? r.base, breakers: r.breakers ?? zeros(),
  budget: r.budget ?? r.generalUsed ?? 8, category: r.category ?? '', specialCount: r.specialCount ?? r.specialUsed ?? 0, title: r.title });

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
  const [vibes, setVibes] = useState(() => ({ ...defaultVibes(), ...read(KEYS.vibes, {}) }));
  const [compare, setCompare] = useState(() => read(KEYS.compare, []).filter(validBuild));
  const [toast, setToast] = useState('');
  const d = useMemo(() => derive(build), [build]);

  useEffect(() => write(KEYS.build, build), [build]);
  useEffect(() => write(KEYS.library, library), [library]);
  useEffect(() => write(KEYS.lab, lab), [lab]);
  useEffect(() => write(KEYS.vibes, vibes), [vibes]);
  useEffect(() => write(KEYS.compare, compare), [compare]);
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
  const save = b => {
    const item = { ...blank(), ...fromResult(b), id: crypto.randomUUID(),
      title: b.title ?? derive(fromResult(b)).finalName ?? 'Saved build', savedAt: Date.now() };
    setLibrary(l => [item, ...l]); notify(`Saved “${item.title}”.`);
  };
  const findWith = (badge, tier) => { setLab(l => ({ ...l, badgeGoals: { ...l.badgeGoals, [badge]: tier } })); setView('lab'); };

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
        onOptimize={body => { setLab(l => ({ ...l, positions: [body.position], heights: [body.height, body.height] })); setView('lab'); }} />}
      {view === 'lab' && <LabView lab={lab} setLab={setLab} onOpen={open} onCompare={addCompare} onSave={save} />}
      {view === 'vibes' && <VibesView vibes={vibes} setVibes={setVibes} onOpen={open} onCompare={addCompare} onSave={save} />}
      {view === 'similar' && <SimilarView build={build} library={library} onOpen={open} onCompare={addCompare} onSave={save} />}
      {view === 'badges' && <BadgesView build={build} onFindWith={findWith} />}
      {view === 'compare' && <CompareView items={compare} setItems={setCompare} build={build} library={library} onOpen={open} />}
      {view === 'explorer' && <ExplorerView build={build} onUseBody={body => { setBuild({ body, base: empty(), breakers: zeros() }); setView('builder'); }} />}
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
        <footer><button className="primary" onClick={() => onOpen(b)}>Open</button><button onClick={() => onCompare(b)}>Compare</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(shareUrl(b)); notify('Share link copied.'); } catch { prompt('Copy this link', shareUrl(b)); } }}>Share</button>
          <button className="danger" onClick={() => setLibrary(l => l.filter(x => x.id !== b.id))}>Delete</button></footer>
      </article>; })}</div>
    </section>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
