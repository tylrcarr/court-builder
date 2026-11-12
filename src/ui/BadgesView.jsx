import React, { useMemo, useState } from 'react';
import { badges, badgeTier, empty, feet, inHeight, name, overall, tiers } from '../engine.js';
import { cheapestBadge } from '../solver.js';
import costs from '../badge-costs.json' with { type: 'json' };
import { derive } from '../derive.js';
import { TierPill, disciplineColour, label, requirementText } from './common.jsx';

export const tokenCost = (badge, tier, height) => {
  const row = costs.costs[badge]?.[tier];
  return row ? row[1 + height - row[0]] ?? null : null;
};

function capReason(badge, tier, caps) {
  const reqs = badge.tiers.find(x => x.tier === tier)?.requirements ?? [];
  const over = reqs.filter(r => r.minimum > caps[r.attribute]);
  return over.length ? "Above this body's caps: " + over.map(r => `${name(r.name)} cap ${caps[r.attribute]}`).join(', ')
    : 'Does not fit in the 99 OVR budget on this body';
}

export default function BadgesView({ build, onFindWith }) {
  const d = useMemo(() => derive(build), [build]);
  const [query, setQuery] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(null);
  const h = build.body.height;
  const floorOvr = overall(empty(), h).score;
  const rows = badges.map(b => ({ b, tier: badgeTier(b, d.final, h), eligible: inHeight(b, h) }))
    .filter(({ b, tier, eligible }) => (!discipline || b.discipline === discipline)
      && (!query || b.name.replaceAll('_', ' ').includes(query.toLowerCase()))
      && (status === 'all' || (status === 'unlocked' ? tier : status === 'locked' ? eligible && !tier : !eligible)));
  const cheapest = useMemo(() => open == null ? null : Object.fromEntries(tiers.map(t => {
    const plan = cheapestBadge(badges.find(b => b.badge === open), t, build.body);
    return [t, plan ? plan.ovr : null];
  })), [open, build.body]);
  const totalTokens = d.unlocked.reduce((s, u) => s + (tokenCost(u.badge.badge, u.tier, h) ?? 0), 0);

  return <div className="badges-view">
    <section className="card">
      <div className="card-head"><div><h2>Badges</h2>
        <p className="muted">Official 2K HQ tier requirements (cross-checked with NBA2KLab) for your {feet(h)} {build.body.position}.
          Final ratings after Cap Breakers count toward badges.</p></div>
        <div className="head-stats"><span><b>{d.unlocked.length}</b> unlocked</span><span><b>{totalTokens}</b> tokens to equip all</span></div></div>
      <div className="picker-tools">
        <input type="search" placeholder="Search badges…" value={query} onChange={e => setQuery(e.target.value)} />
        <select value={discipline} onChange={e => setDiscipline(e.target.value)} aria-label="Category">
          <option value="">All categories</option>{[...new Set(badges.map(b => b.discipline))].map(x => <option key={x} value={x}>{name(x)}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All</option><option value="unlocked">Unlocked</option><option value="locked">Locked (eligible)</option>
          <option value="height">Height restricted</option></select>
      </div>
      <div className="badge-table" role="table">
        <div className="bt-head" role="row"><span>Badge</span><span>Height</span>{tiers.map(t => <span key={t}><TierPill tier={t} small /></span>)}<span>Yours</span></div>
        {rows.map(({ b, tier, eligible }) => <React.Fragment key={b.badge}>
          <button className={'bt-row' + (eligible ? '' : ' dim') + (open === b.badge ? ' open' : '')} role="row"
            onClick={() => setOpen(open === b.badge ? null : b.badge)}>
            <span className="bt-name"><i style={{ background: disciplineColour(b.discipline) }} />{label(b.name)}</span>
            <span>{feet(b.height_inches[0])}–{feet(b.height_inches[1])}</span>
            {tiers.map(t => <span key={t} className={'req' + (tiers.indexOf(tier) >= tiers.indexOf(t) ? ' met' : '')}>{requirementText(b, t)}</span>)}
            <span>{eligible ? <TierPill tier={tier} /> : <em className="muted">Too {h < b.height_inches[0] ? 'short' : 'tall'}</em>}</span>
          </button>
          {open === b.badge && <div className="bt-detail">
            <div className="detail-grid">{tiers.map(t => <div key={t} className="detail-tier">
              <TierPill tier={t} />
              <p>{requirementText(b, t)}</p>
              <small>Tokens to equip: {tokenCost(b.badge, t, h) ?? '–'}</small>
              <small>{!eligible ? 'Not available at this height'
                : cheapest?.[t] == null ? capReason(b, t, d.caps)
                : `Uses at least ${Math.max(0, Math.round((cheapest[t] - floorOvr) / (99 - floorOvr) * 100))}% of the 99 OVR budget here`}</small>
              <button onClick={() => onFindWith(b.badge, t)}>Find builds with {label(t)}</button>
            </div>)}</div>
          </div>}
        </React.Fragment>)}
      </div>
    </section>
  </div>;
}
