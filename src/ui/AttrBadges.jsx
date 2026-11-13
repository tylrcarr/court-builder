import React, { useMemo } from 'react';
import { attributes, badgeTier, inHeight, name } from '../engine.js';
import { goals } from '../breakpoints.js';
import { metaOf } from '../meta.js';
import { tierShort } from '../derive.js';
import { TierPill, label } from './common.jsx';

// Everything a rating feeds: each badge (and dunk/animation package) with a tier that needs it, the level each tier
// needs on this rating, which you've reached, and what else that tier needs. Click a level to set the rating to it.
export function AttrBadges({ d, i, onSet }) {
  const rows = useMemo(() => goals.filter(g => inHeight(g, d.height) && g.tiers.some(t => t.requirements.some(r => r.attribute === i)))
    .map(g => {
      const have = badgeTier(g, d.final, d.height);
      const steps = g.tiers.map(t => {
        const mine = t.requirements.filter(r => r.attribute === i);
        const either = t.requirements.some(r => r.operator_to_next === 'OR');
        const others = t.requirements.filter(r => r.attribute !== i);
        return { tier: t.tier, at: mine.length ? Math.min(...mine.map(r => r.minimum)) : null, either,
          others: others.map(r => `${name(r.name)} ${r.minimum}`), othersMet: others.every(r => d.final[r.attribute] >= r.minimum) };
      }).filter(s => s.at != null);
      const next = steps.find(s => s.at > d.final[i]);
      return { g, have, steps, next, meta: metaOf(g, d.position) };
    })
    .sort((a, b) => (b.have ? 1 : 0) - (a.have ? 1 : 0) || (a.next?.at ?? 999) - (b.next?.at ?? 999) || b.meta - a.meta), [d, i]);
  const f = d.final[i], boost = f - d.ratings[i];
  if (!rows.length) return <div className="attr-badges"><p className="muted small">No badge or animation tier uses {name(attributes[i].name)} at this height.</p></div>;
  return <div className="attr-badges">
    <p className="muted small">What this rating unlocks at this height. Lit = reached ({f} now{boost ? `, ${d.ratings[i]} + ${boost} from Cap Breakers` : ''}).
      Click a level to set the rating to it.</p>
    {rows.map(({ g, have, steps, meta }) => <div key={g.name} className="ab-row">
      <span className="ab-name" title={meta >= 2 ? 'Meta badge' : undefined}>{g.label ?? label(g.name)}{meta >= 2 && <span className="meta-dot" aria-label="meta">★</span>}</span>
      <span className="ab-have">{have ? <TierPill tier={have} small /> : <span className="muted small">—</span>}</span>
      <span className="ab-steps">{steps.map(s => {
        const reached = f >= s.at, capped = s.at > d.caps[i];
        return <button key={s.tier} className={`ab-step tier-${s.tier}` + (reached ? ' on' : '') + (capped ? ' capped' : '')} disabled={capped || reached && s.at === f}
          title={`${label(s.tier)}: ${name(attributes[i].name)} ${s.at}${s.either ? ' (or another rating)' : ''}`
            + (s.others.length ? `\nAlso needs: ${s.others.join(', ')}${s.othersMet ? ' ✓' : ''}` : '') + (capped ? `\nAbove this body's cap (${d.caps[i]})` : '')}
          onClick={() => onSet(Math.max(25, s.at - boost))}>
          <b>{tierShort(s.tier)}</b>{s.at}{s.others.length > 0 && !s.othersMet ? '*' : ''}</button>;
      })}</span>
    </div>)}
    <p className="muted small">* also needs other ratings you don't have yet (hover a level). Greyed: above this body's cap.</p>
  </div>;
}
