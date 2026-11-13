import React, { useEffect, useState } from 'react';
import { name } from '../engine.js';
import { findAnimation, readProfiles, writeProfiles } from '../anim-wants.js';
import { animations } from '../animations.js';

// Saved animation profiles (e.g. "Bigs", "Guards"): a set of wanted animations, contact dunk levels and, optionally,
// attribute minimums. Shared by the Lab and Reference → Animations (which has no dunk levels: mustHave is optional).
export function AnimationProfiles({ prefs, setPrefs, mustHave = null, setMustHave = null, notify }) {
  const [profiles, setProfiles] = useState(readProfiles);
  const [naming, setNaming] = useState(null); // { name, withMins }
  useEffect(() => writeProfiles(profiles), [profiles]);
  // Another view may have saved one: re-read when the list is shown.
  useEffect(() => { const sync = () => setProfiles(readProfiles()); window.addEventListener('focus', sync); return () => window.removeEventListener('focus', sync); }, []);
  const wants = prefs.wantAnims ?? [];
  const dunks = mustHave ? Object.fromEntries(animations.filter(g => mustHave[g.name]).map(g => [g.name, mustHave[g.name]])) : {};
  const hasMins = Object.values(prefs.minimums ?? {}).some(v => v > 25);
  const save = () => {
    const nm = naming.name.trim(); if (!nm) return;
    const entry = { id: profiles.find(x => x.name === nm)?.id ?? crypto.randomUUID(), name: nm, anims: wants, dunks,
      minimums: naming.withMins ? Object.fromEntries(Object.entries(prefs.minimums ?? {}).filter(([, v]) => v > 25)) : null };
    setProfiles(l => [entry, ...l.filter(x => x.id !== entry.id)]); setNaming(null); notify(`Saved profile “${nm}”.`);
  };
  const load = pr => {
    setPrefs(p => ({ ...p, wantAnims: [...pr.anims], ...(pr.minimums ? { minimums: { ...pr.minimums } } : {}) }));
    if (setMustHave) setMustHave(m => { const next = { ...m }; for (const g of animations) delete next[g.name]; return { ...next, ...(pr.dunks ?? {}) }; });
    notify(`Profile “${pr.name}”: ${pr.anims.length} animation${pr.anims.length === 1 ? '' : 's'}${pr.minimums ? ' and its attribute minimums' : ''}.`);
  };
  return <div className="profiles"><span className="muted small">Profiles:</span>
    {!profiles.length && !naming && <span className="muted small">none yet</span>}
    {profiles.map(pr => <span key={pr.id} className="chip"><button className="linkish" onClick={() => load(pr)}
      title={`${pr.anims.map(k => findAnimation(k)?.name).filter(Boolean).join(', ') || 'No animations'}${pr.minimums ? '\nMinimums: ' + Object.entries(pr.minimums).map(([k, v]) => `${name(k)} ${v}`).join(', ') : ''}`}>{pr.name}</button>
      <button className="linkish" aria-label={`Delete profile ${pr.name}`} onClick={() => setProfiles(l => l.filter(x => x.id !== pr.id))}>×</button></span>)}
    {naming ? <span className="profile-save"><input type="text" autoFocus placeholder="Profile name (e.g. Bigs)" value={naming.name} maxLength={30}
      onChange={e => setNaming({ ...naming, name: e.target.value })} onKeyDown={e => e.key === 'Enter' && save()} />
      <label className="check small"><input type="checkbox" checked={naming.withMins} onChange={e => setNaming({ ...naming, withMins: e.target.checked })} />with attribute minimums</label>
      <button className="mini-btn primary" onClick={save}>Save</button><button className="mini-btn" onClick={() => setNaming(null)}>Cancel</button></span>
      : <button className="mini-btn" disabled={!wants.length && !Object.keys(dunks).length && !hasMins} onClick={() => setNaming({ name: '', withMins: false })}>Save as profile…</button>}
  </div>;
}
