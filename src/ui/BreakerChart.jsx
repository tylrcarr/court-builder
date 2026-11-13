import React, { useMemo } from 'react';
import { attributes, badgeTier, inHeight, name, overall, tiers } from '../engine.js';
import { goals } from '../breakpoints.js';
import { label } from './common.jsx';
import { groups } from '../derive.js';
import { archetypeHolders } from '../breakpoints.js';
import { Archetype, disciplineColour, ratingTone } from './common.jsx';
import { archetypeName } from '../archetypes.js';

// Read-only Cap Breaker chart for a derived build (see derive): every attribute's base → final against its cap and the
// 5 breaker steps under the build's archetype, applied ones lit. Rows where 5 breakers add BIG or more are marked: those are
// where breakers are "glitchy" for this archetype (it weighs them lightly).
export const BIG = 12;
const total = steps => steps.reduce((s, g) => s + g, 0);

// What each breaker step is worth: the Overall you'd pay to buy those rating points as base instead (the rest of the
// build as is). A big step on an attribute the archetype barely weighs can be worth less than +1 on an expensive one.
export function breakerSavings(d) {
  if (d.height == null) return null;
  const base = d.ratings, now = overall(base, d.height).score;
  return attributes.map((_, i) => {
    let level = base[i], prev = now;
    return d.ladders[i].map(gain => {
      if (!gain) return 0;
      level += gain;
      const s = overall(base.map((v, j) => j === i ? level : v), d.height).score;
      const saved = s - prev; prev = s;
      return saved;
    });
  });
}
const fmt = x => x.toFixed(2);

// Badge tiers each breaker step would unlock: for attribute i at step k, what reaching k+1 breakers adds over k (the other
// ratings as they are now). [i][k] → ["Posterizer Gold", …].
export function stepUnlocks(d) {
  if (d.height == null) return null;
  const list = goals.filter(g => inHeight(g, d.height));
  const tierAt = f => list.map(g => tiers.indexOf(badgeTier(g, f, d.height)));
  return attributes.map((_, i) => {
    let level = d.ratings[i], prev = tierAt(d.final.map((v, j) => j === i ? level : v));
    return d.ladders[i].map(gain => {
      if (!gain) return [];
      level += gain;
      const now = tierAt(d.final.map((v, j) => j === i ? level : v));
      const out = list.flatMap((g, k) => now[k] > prev[k] ? [`${g.label ?? label(g.name)}${g.tiers.length > 1 ? ' ' + label(tiers[now[k]]) : ''}`] : []);
      prev = now;
      return out;
    });
  });
}

// onStep(i, count) (optional): the steps become buttons; clicking one sets that attribute's breakers to it (click the last
// lit step again to take them all off, like the game), so a result card can try other breakers and show what the rating would be.
export function BreakerChart({ d, savings, focus = null, onStep, showArchetype = true }) {
  const sv = savings ?? breakerSavings(d);
  const opens = useMemo(() => stepUnlocks(d), [d]);
  // The most Overall a breaker you haven't used yet would save (next step on each attribute).
  const next = sv && attributes.map(({ index: i }) => ({ i, gain: d.ladders[i][d.applied[i]] ?? 0, saved: sv[i][d.applied[i]] ?? 0 }))
    .filter(x => x.gain > 0).sort((a, b) => b.saved - a.saved)[0];
  return <div className="cb-chart">
    <p className="muted small">{showArchetype && <>{d.height != null ? <Archetype height={d.height} type={d.state.playerType} /> : `Archetype #${d.state.playerType + 1}`} · </>}steps for this archetype (lit = applied) · ★ = 5 breakers add {BIG}+
      {sv && <> · <b>OVR</b> = Overall the applied breakers save (what those points would cost as base)</>}
      {opens && <> · <span className="opens-key" /> violet = that step unlocks a badge (hover for which)</>}</p>
    {next && <p className="small cb-next">Best next breaker: <b>{name(attributes[next.i].name)}</b> +{next.gain} (saves {fmt(next.saved)} Overall)</p>}
    <div className="cb-grid">{groups.map(g => <div key={g} className="cb-group">
      <h4 style={{ '--accent': disciplineColour(g) }}>{name(g)}</h4>
      {attributes.filter(a => a.discipline === g).map(({ index: i, name: key }) => {
        const steps = d.ladders[i], big = total(steps) >= BIG;
        const used = sv ? sv[i].slice(0, d.applied[i]).reduce((s, x) => s + x, 0) : 0;
        return <div key={key} className={'cb-row' + (d.applied[i] ? ' used' : '') + (focus === i ? ' focus' : '')}
          ref={focus === i ? el => el?.scrollIntoView({ block: 'nearest' }) : undefined}>
          <span className="cb-name">{name(key)}{big && <span className="cb-big" title={`5 breakers would add +${total(steps)} from this base`}> ★</span>}
            {used > 0 && <small className="cb-save" title="Overall these breakers save"> {fmt(used)} OVR</small>}</span>
          <span className="cb-val">{d.applied[i] ? <>{d.ratings[i]}<i>→</i></> : null}<b className={ratingTone(d.final[i])}>{d.final[i]}</b><small>/{d.caps[i]}</small></span>
          <div className={'breakers' + (onStep ? '' : ' static')}>{steps.map((gain, step) => {
            const reach = d.ratings[i] + total(steps.slice(0, step + 1));
            const unlocks = opens?.[i][step] ?? [];
            const title = gain ? `Breaker ${step + 1}: +${gain} → ${reach}${sv ? ` · saves ${fmt(sv[i][step])} Overall` : ''}`
              + (unlocks.length ? `\nUnlocks ${unlocks.join(', ')}` : '') : 'No gain left';
            const cls = (step < d.applied[i] ? 'on' : gain ? '' : 'none') + (unlocks.length ? ' opens' : '');
            return onStep && gain
              ? <button key={step} type="button" className={cls} title={title + (step + 1 === d.applied[i] ? ' · click to take them all off' : ' · click to try')}
                onClick={() => onStep(i, step + 1 === d.applied[i] ? 0 : step + 1)}>+{gain}</button>
              : <span key={step} className={cls} title={title}>{gain ? '+' + gain : '·'}</span>;
          })}</div>
        </div>;
      })}
    </div>)}</div>
  </div>;
}

// Collapsed by default, for result cards and the Builder.
// open/onToggle/focus (optional): controlled by a card whose ratings strip opens the chart at one attribute.
export function BreakerChartDetails({ d, className = 'plan-badges', open, onToggle, focus = null, onStep, edited = false, onReset }) {
  const glitchy = attributes.filter(a => total(d.ladders[a.index]) >= BIG).length;
  const sv = useMemo(() => breakerSavings(d), [d]);
  const saved = sv ? attributes.reduce((s, { index: i }) => s + sv[i].slice(0, d.applied[i]).reduce((t, x) => t + x, 0), 0) : 0;
  return <details className={className} {...(open != null ? { open } : {})}
    onToggle={onToggle ? e => onToggle(e.currentTarget.open) : undefined}>
    <summary>Cap Breaker chart · {d.height != null ? archetypeName(d.height, d.state.playerType) : `archetype #${d.state.playerType + 1}`} · {d.breakerCount} used{saved > 0 ? ` · saves ${saved.toFixed(1)} Overall` : ''}{glitchy ? ` · ${glitchy} ★` : ''}{edited ? ' · edited' : ''}</summary>
    {onStep && <p className="small muted">Click a step to try it: the card's ratings, badges and meta update. {edited && onReset
      && <button type="button" className="mini-btn" onClick={onReset}>Back to the plan</button>}</p>}
    <HoldersNote d={d} />
    <BreakerChart d={d} savings={sv} focus={focus} onStep={onStep} />
  </details>;
}

// Ratings the archetype rests on (not any badge): how far each can drop before the archetype, and every breaker step, changes.
export function HoldersNote({ d }) {
  const holders = useMemo(() => d.position ? archetypeHolders(d) : [], [d]);
  if (!holders.length) return null;
  // Grouped by what they'd turn into and how many points they have to spare: "Close Shot 79, Post Control 79 (no spare points → Rim Protector)".
  const groupsOf = new Map();
  for (const h of holders) { const k = `${h.to}|${h.free}`; groupsOf.set(k, [...(groupsOf.get(k) ?? []), h]); }
  return <p className="small cb-hold" title="Lower one of these past its spare points and the archetype changes, and with it every Cap Breaker step.">
    <b>Held for the archetype</b> (not for badges): {[...groupsOf.values()].map(list => `${list.map(h => `${name(attributes[h.i].name)} ${h.rating}`).join(', ')}`
      + ` (${list[0].free ? `${list[0].free} to spare` : 'none to spare'} → ${archetypeName(d.height, list[0].to)})`).join('; ')}.</p>;
}
