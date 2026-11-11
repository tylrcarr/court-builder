import React, { useMemo } from 'react';
import { attributes, badges, name, tiers } from '../engine.js';
import { derive, groups } from './derive.js';
import { BodyLine, TierPill, disciplineColour, label, ratingTone } from './common.jsx';

export default function CompareView({ items, setItems, build, library, onOpen }) {
  const ds = useMemo(() => items.map(it => ({ it, d: derive(it) })), [items]);
  const add = b => setItems([...items, b].slice(-4));
  const badgeRows = badges.filter(b => ds.some(({ d }) => d.unlocked.some(u => u.badge.badge === b.badge)));

  return <div className="compare">
    <section className="card">
      <div className="card-head"><div><h2>Compare</h2><p className="muted">Up to four builds side by side. Best value in each row is highlighted.</p></div>
        <div className="actions">
          <button onClick={() => add({ ...build, title: 'Current build' })}>Add current build</button>
          {library.length > 0 && <select value="" onChange={e => { const b = library.find(x => x.id === e.target.value); if (b) add(b); }} aria-label="Add saved build">
            <option value="">Add saved build…</option>{library.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select>}
          {items.length > 0 && <button onClick={() => setItems([])}>Clear</button>}
        </div></div>
      {!items.length ? <p className="muted">Use “Compare” on any search result or saved build, or add the current build.</p> :
        <div className="compare-table" style={{ '--cols': items.length }}>
          <div className="ct-row ct-head"><span />{ds.map(({ it, d }, k) => <div key={k} className="ct-build">
            <h3>{it.title ?? d.finalName ?? 'Build'}</h3><BodyLine body={it.body} />
            <small>{d.finalName}</small>
            <div className="actions"><button onClick={() => onOpen(it)}>Open</button>
              <button onClick={() => setItems(items.filter((_, j) => j !== k))}>Remove</button></div></div>)}</div>
          {groups.map(g => <React.Fragment key={g}>
            <div className="ct-group" style={{ color: disciplineColour(g) }}>{name(g)}</div>
            {attributes.filter(a => a.discipline === g).map(a => {
              const values = ds.map(({ d }) => d.final[a.index]);
              const best = Math.max(...values);
              return <div key={a.name} className="ct-row"><span>{name(a.name)}</span>
                {values.map((v, k) => <span key={k} className={'ct-val ' + ratingTone(v) + (v === best && items.length > 1 ? ' best' : '')}>
                  {v}{ds[k].d.final[a.index] > ds[k].d.ratings[a.index] && <small> ({ds[k].d.ratings[a.index]})</small>}</span>)}</div>;
            })}
          </React.Fragment>)}
          <div className="ct-group">Badges</div>
          <div className="ct-row"><span>Total unlocked</span>{ds.map(({ d }, k) => <span key={k} className="ct-val">{d.unlocked.length}</span>)}</div>
          {badgeRows.map(b => <div key={b.badge} className="ct-row"><span>{label(b.name)}</span>
            {ds.map(({ d }, k) => { const t = d.unlocked.find(u => u.badge.badge === b.badge)?.tier;
              return <span key={k} className="ct-val">{t ? <TierPill tier={t} small /> : '–'}</span>; })}</div>)}
        </div>}
    </section>
  </div>;
}

export { tiers };
