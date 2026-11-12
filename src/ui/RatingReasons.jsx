import React, { useMemo } from 'react';
import { attributes, badgeTier, inHeight, name } from '../engine.js';
import { archetypeHolders, goals, specMinimums, valueOf } from '../breakpoints.js';
import { attrMetaFor, metaOf } from '../meta.js';
import { tierLabel } from '../derive.js';
import { label } from './common.jsx';

// Why each rating sits where it does, for a derived build (see derive): the badge tiers it's the breakpoint for (the
// highest requirement on it among tiers the build holds), a meta target, the specialization, holding the archetype, or
// the body's cap. Anything above its last reason is flagged as spare (points that could go elsewhere).
export function ratingReasons(d, prefs) {
  const holders = new Map(archetypeHolders(d).map(h => [h.i, h]));
  const meta = attrMetaFor(d.position, d.height), spec = specMinimums(d.category ?? '');
  const held = goals.filter(g => inHeight(g, d.height)).map(g => ({ g, tier: badgeTier(g, d.final, d.height) })).filter(x => x.tier
    && (metaOf(x.g, d.position) > 0 || valueOf(prefs, x.g) > 0));
  return attributes.map(({ name: key }, i) => {
    const f = d.final[i], why = [];
    let at = 25;
    for (const { g, tier } of held) {
      const t = g.tiers.find(x => x.tier === tier);
      for (const r of t.requirements) if (r.attribute === i && r.minimum <= f) {
        why.push({ at: r.minimum, text: `${g.label ?? label(g.name)} ${tierLabel(tier)}` });
        at = Math.max(at, r.minimum);
      }
    }
    const m = meta[key];
    if (m && f >= Math.min(m[1], m[2] ?? 99)) { const hit = f >= m[1] ? m[1] : m[2]; why.push({ at: hit, text: `meta ${f >= m[1] ? 'target' : 'floor'} ${hit}` }); at = Math.max(at, hit); }
    if (spec[i] > 25 && d.ratings[i] >= spec[i]) { why.push({ at: spec[i], text: 'specialization' }); at = Math.max(at, spec[i]); }
    if ((prefs?.continuous ?? []).includes(key)) { why.push({ at: f, text: 'your feel pick' }); at = f; }
    const h = holders.get(i);
    if (h) { why.push({ at: f, text: `holds archetype #${d.state.playerType}` }); at = f; }
    if (f >= d.caps[i]) { why.push({ at: f, text: 'at cap' }); at = f; }
    const strongest = why.sort((a, b) => b.at - a.at);
    return { i, f, why: strongest, spare: Math.max(0, f - at) };
  });
}

export function RatingReasons({ d, prefs }) {
  const rows = useMemo(() => ratingReasons(d, prefs), [d, prefs]);
  const spare = rows.filter(r => r.spare >= 3 && r.f > 40);
  return <details className="plan-badges reasons">
    <summary>Why these ratings{spare.length ? ` · ${spare.length} with spare points` : ''}</summary>
    <div className="reason-grid">{rows.filter(r => r.f > 25).sort((a, b) => b.f - a.f).map(r => <div key={r.i} className="reason-row">
      <span className="reason-name">{name(attributes[r.i].name)} <b>{r.f}</b></span>
      <span className="reason-why">{r.why.length ? r.why.slice(0, 3).map(w => `${w.text}${w.at !== r.f ? ` (${w.at})` : ''}`).join(' · ') : <em className="muted">no breakpoint</em>}
        {r.spare >= 3 && <span className="reason-spare"> · {r.spare} spare</span>}</span>
    </div>)}</div>
  </details>;
}
