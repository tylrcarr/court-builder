import React, { useMemo } from 'react';
import { attributes, name, overall } from '../engine.js';
import { groups } from '../derive.js';
import { archetypeHolders } from '../breakpoints.js';
import { disciplineColour, ratingTone } from './common.jsx';

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

export function BreakerChart({ d, savings, focus = null }) {
  const sv = savings ?? breakerSavings(d);
  // The most Overall a breaker you haven't used yet would save (next step on each attribute).
  const next = sv && attributes.map(({ index: i }) => ({ i, gain: d.ladders[i][d.applied[i]] ?? 0, saved: sv[i][d.applied[i]] ?? 0 }))
    .filter(x => x.gain > 0).sort((a, b) => b.saved - a.saved)[0];
  return <div className="cb-chart">
    <p className="muted small">Archetype #{d.state.playerType} · steps for this archetype (lit = applied) · ★ = 5 breakers add {BIG}+
      {sv && <> · <b>OVR</b> = Overall the applied breakers save (what those points would cost as base)</>}</p>
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
          <div className="breakers static">{steps.map((gain, step) => <span key={step}
            className={step < d.applied[i] ? 'on' : gain ? '' : 'none'}
            title={gain ? `Breaker ${step + 1}: +${gain}${sv ? ` · saves ${fmt(sv[i][step])} Overall` : ''}` : 'No gain left'}>
            {gain ? '+' + gain : '·'}</span>)}</div>
        </div>;
      })}
    </div>)}</div>
  </div>;
}

// Collapsed by default, for result cards and the Builder.
// open/onToggle/focus (optional): controlled by a card whose ratings strip opens the chart at one attribute.
export function BreakerChartDetails({ d, className = 'plan-badges', open, onToggle, focus = null }) {
  const glitchy = attributes.filter(a => total(d.ladders[a.index]) >= BIG).length;
  const sv = useMemo(() => breakerSavings(d), [d]);
  const saved = sv ? attributes.reduce((s, { index: i }) => s + sv[i].slice(0, d.applied[i]).reduce((t, x) => t + x, 0), 0) : 0;
  const holders = useMemo(() => d.position ? archetypeHolders(d) : [], [d]);
  return <details className={className} {...(open != null ? { open } : {})}
    onToggle={onToggle ? e => onToggle(e.currentTarget.open) : undefined}>
    <summary>Cap Breaker chart · archetype #{d.state.playerType} · {d.breakerCount} used{saved > 0 ? ` · saves ${saved.toFixed(1)} Overall` : ''}{glitchy ? ` · ${glitchy} ★` : ''}</summary>
    {holders.length > 0 && <p className="small cb-hold">Held for the archetype, not for badges: {holders.map(h =>
      `${name(attributes[h.i].name)} ${h.rating} (${h.free ? `${h.free} to spare, ${h.free + 1}` : '1'} lower turns it into #${h.to})`).join(', ')}.
      Lower one past that and every Cap Breaker step changes (#{d.state.playerType}'s are why the breakers land where they do).</p>}
    <BreakerChart d={d} savings={sv} focus={focus} />
  </details>;
}
