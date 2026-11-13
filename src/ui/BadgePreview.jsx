import React, { useEffect, useState } from 'react';
import { badges, inHeight, tiers } from '../engine.js';
import { LEGEND, SYNERGY_SLOTS, applySynergy, disciplineTokens, groups, tokensEstimated } from '../derive.js';
import { tokenCost } from './BadgesView.jsx';
import { TierPill, disciplineColour, label, requirementText } from './common.jsx';
import { tierShort } from '../derive.js';
import { metaSetup, shortfall } from '../equip.js';
import { name } from '../engine.js';

// Badge preview like the in-game badge screen: every badge you qualify for by discipline, its token cost, and Synergy
// boosts (Fuse / Reaction, +1 or +2 tiers up to Legend) you plan to put on it.
// How many Synergy slots you actually have (they come from Seasons, Specialization, Crew and REP, so early in a season
// most players have far fewer than 16). Saved per browser, not per build.
const SLOTS_KEY = 'court-builder.synergy-slots.v1';
const DEFAULT_SLOTS = { 1: 8 };
function useSlots() {
  const [slots, setSlots] = useState(() => { try { return { ...DEFAULT_SLOTS, ...JSON.parse(localStorage.getItem(SLOTS_KEY)) }; } catch { return DEFAULT_SLOTS; } });
  useEffect(() => { try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch { /* storage blocked */ } }, [slots]);
  return [slots, setSlots];
}

// Bonus badge tokens (Season rewards and the like): one pool that covers any discipline's shortfall. Saved per browser.
const BONUS_KEY = 'court-builder.bonus-tokens.v2';
function useBonus() {
  const [bonus, setBonus] = useState(() => { try { return Number(JSON.parse(localStorage.getItem(BONUS_KEY))) || 0; } catch { return 0; } });
  useEffect(() => { try { localStorage.setItem(BONUS_KEY, JSON.stringify(bonus)); } catch { /* storage blocked */ } }, [bonus]);
  return [bonus, setBonus];
}

// HQ's token table is the price to equip a badge at a tier (Bronze 3, Silver 2, Gold 1…), not a step on top of the tier below.
const equipCost = (badge, tier, height) => tokenCost(badge.badge, tier, height) ?? 0;

export default function BadgePreview({ build, d, setBuild }) {
  const [showLocked, setShowLocked] = useState(false);
  const [slots, setSlots] = useSlots();
  const [bonus, setBonus] = useBonus();
  // The tier you equip each badge at ('off' = not equipped); the default is the tier you unlocked. Kept per build.
  const equip = build.equip ?? {};
  const h = build.body.height;
  const unlockedBy = Object.fromEntries(d.unlocked.map(u => [u.badge.name, u]));
  const tierOf = key => { const t = equip[key]; const top = unlockedBy[key]?.tier;
    return t === 'off' ? 'off' : t && tiers.indexOf(t) <= tiers.indexOf(top) ? t : top; };
  const setTier = (key, t) => setBuild({ equip: { ...equip, [key]: t === unlockedBy[key]?.tier ? undefined : t } }, 'Equipped badges');
  const synergy = build.synergy ?? {};
  const equipped = d.unlocked.filter(u => tierOf(u.badge.name) !== 'off').map(u => ({ ...u, tier: tierOf(u.badge.name) }));
  const syn = applySynergy(equipped, synergy);
  const byName = Object.fromEntries(syn.rows.map(r => [r.badge.name, r]));
  const eligible = badges.filter(b => inHeight(b, h));
  // Tokens are a budget per discipline (earned from that discipline's ratings), spent on its badges; Fused badges are free.
  const earned = disciplineTokens(d.final, h);
  const spent = Object.fromEntries(groups.map(g => [g, syn.rows.filter(r => r.badge.discipline === g && !(r.boost && !r.reaction))
    .reduce((s, r) => s + equipCost(r.badge, r.tier, h), 0)]));
  const need = shortfall(spent, earned);
  const metaPlan = () => {
    const rows = d.unlocked.map(u => ({ key: u.badge.name, discipline: u.badge.discipline, maxTier: u.tier, goal: u.badge,
      free: !!synergy[u.badge.name] && !synergy[u.badge.name].reaction }));
    const plan = metaSetup(rows, earned, bonus, (k, t) => equipCost(unlockedBy[k].badge, t, h), build.body.position);
    setBuild({ equip: Object.fromEntries(Object.entries(plan).filter(([k, t]) => t !== unlockedBy[k].tier)) }, 'Meta badge setup');
  };
  const freed = syn.rows.reduce((s, r) => s + (r.boost && !r.reaction ? equipCost(r.badge, r.tier, h) : 0), 0);
  // +2 comes only from the Build Specialization (Level 10 reward, assumed earned): one slot, specialization badges only.
  // The season +2 slots are left out: most players don't have them.
  const category = d.specOk ? build.category : '';
  const plus2 = syn.rows.filter(r => r.boost === 2);
  const canTake = (r, boost) => r.boost === boost || (boost === 1 ? syn.used[1] < slots[1]
    : r.badge.discipline === category && plus2.length < 1);
  const over = syn.used[1] > slots[1] || plus2.length > 1 || plus2.some(r => r.badge.discipline !== category);
  // Boosts on badges this build no longer unlocks stay saved but don't count.
  const stale = Object.keys(synergy).filter(k => !byName[k]);

  const set = (key, value) => {
    const next = { ...synergy };
    if (value) next[key] = value; else delete next[key];
    setBuild({ synergy: next });
  };
  const toggleBoost = (r, boost) => set(r.badge.name, r.boost === boost ? null : { boost, ...(r.reaction ? { reaction: true } : {}) });
  const toggleReaction = r => set(r.badge.name, { boost: r.boost, ...(r.reaction ? {} : { reaction: true }) });

  // Token price at each tier (Bronze, Silver, Gold, Hall of Fame) at this height; yours is highlighted.
  const steps = (b, tier) => <span className="bp-steps" title={'Tokens to equip at each tier: ' + tiers.map(t => `${label(t)} ${tokenCost(b.badge, t, h) ?? '–'}`).join(', ')}>
    {tiers.map(t => <i key={t} className={t === tier ? t : ''}>{tokenCost(b.badge, t, h) ?? '–'}</i>)}</span>;

  // Equip picker: off, or any tier up to the one you unlocked, each with its token price.
  const tierPicker = b => {
    const top = unlockedBy[b.name]?.tier, at = tierOf(b.name);
    return <span className="bp-pick" role="group" aria-label={`Equip ${label(b.name)} at`}>
      <button className={at === 'off' ? 'on off' : 'off'} aria-pressed={at === 'off'} title="Don't equip (costs nothing)" onClick={() => setTier(b.name, 'off')}>–</button>
      {tiers.map(t => { const ok = top && tiers.indexOf(t) <= tiers.indexOf(top), price = tokenCost(b.badge, t, h);
        return <button key={t} disabled={!ok} className={(at === t ? 'on ' : '') + t} aria-pressed={at === t}
          title={ok ? `Equip at ${label(t)}: ${price ?? '–'} token${price === 1 ? '' : 's'}` : `${label(t)} not unlocked: ${requirementText(b, t)}`}
          onClick={() => setTier(b.name, t)}><b>{tierShort(t)}</b><small>{price ?? '–'}</small></button>; })}
    </span>;
  };
  const row = b => {
    const r = byName[b.name];
    if (!r && unlockedBy[b.name]) return <div key={b.badge} className="bp-row unequipped" title="Unlocked, not equipped">
      <span className="bp-name">{label(b.name)}</span><span className="bp-tier" />{tierPicker(b)}<span className="bp-tokens">0</span><span className="bp-syn" /></div>;
    if (!r) return <div key={b.badge} className="bp-row locked" title={tiers.map(t => `${label(t)}: ${requirementText(b, t)}`).join('\n')}>
      <span className="bp-name bp-locked-name">{label(b.name)}</span><TierPill tier={null} small />{steps(b, null)}<span className="bp-tokens" /><span className="bp-syn" /></div>;
    const cost = equipCost(b, r.tier, h);
    return <div key={b.badge} className={'bp-row' + (r.boost ? ' boosted' : '')}
      title={`${label(b.name)} ${label(r.tier)}${r.boost ? ` → ${label(r.shown)} with ${r.reaction ? 'Reaction' : 'Fuse'} +${r.boost}` : ''}\n`
        + tiers.map(t => `${label(t)}: ${requirementText(b, t)}`).join('\n')}>
      <span className="bp-name">{label(b.name)}</span>
      <span className="bp-tier">{r.boost ? <><i>→</i><TierPill tier={r.shown} small /></> : null}</span>
      {tierPicker(b)}
      <span className="bp-tokens" title="Tokens to equip at the tier you picked (Fused badges are free)">{r.boost && !r.reaction ? <s>{cost}</s> : cost}</span>
      <span className="bp-syn">
        {(b.discipline === category ? [1, 2] : [1]).map(boost => <button key={boost} className={r.boost === boost ? 'on' : ''} aria-pressed={r.boost === boost}
          disabled={!canTake(r, boost)}
          title={boost === 2 ? `${r.boost === 2 ? 'Remove from' : 'Put in'} your ${name(category)} Specialization +2 slot` : `${r.boost === 1 ? 'Remove from' : 'Put in'} a +1 Synergy slot`}
          onClick={() => toggleBoost(r, boost)}>+{boost}</button>)}
        {r.boost > 0 && <button className={'react' + (r.reaction ? ' on' : '')} aria-pressed={r.reaction}
          disabled={!r.reaction && syn.reactions >= syn.fuses - 1}
          title={r.reaction ? 'Reaction: boosted once its Fuse badge triggers enough times in a game. Click for Fuse (always on, no tokens).'
            : 'Fuse: boosted all game and costs no tokens. Click to make it a Reaction (needs another Fuse badge to pair with).'}
          onClick={() => toggleReaction(r)}>{r.reaction ? 'React' : 'Fuse'}</button>}
      </span>
    </div>;
  };

  return <section className="card badge-preview">
    <div className="row-head">
      <h3>Badges <span className="muted">{d.unlocked.length}</span></h3>
      <div className="bp-stats">
        {freed > 0 && <span title="Tokens Fused badges don't need">Fuse saves <b>{freed}</b> tokens</span>}
        <label className={'bp-slots' + (syn.used[1] > slots[1] ? ' warn' : '')} title={`+1 Synergy slots you have (the game has up to ${SYNERGY_SLOTS[1]})`}>
          Synergy +1 <b>{syn.used[1]}</b>/
          <input type="number" min={0} max={SYNERGY_SLOTS[1]} value={slots[1]}
            onChange={e => setSlots(s => ({ ...s, 1: Math.max(0, Math.min(SYNERGY_SLOTS[1], Math.trunc(Number(e.target.value)) || 0)) }))} /></label>
        {category && <span title={`Level 10 ${name(category)} Specialization reward: one +2 slot for ${name(category)} badges`}>{name(category)} +2 <b>{plus2.length}/1</b></span>}
        {syn.legends > 0 && <span><TierPill tier={LEGEND} small /> {syn.legends}</span>}
        <label className="check"><input type="checkbox" checked={showLocked} onChange={e => setShowLocked(e.target.checked)} /> Show locked</label>
        {Object.keys(synergy).length > 0 && <button className="mini-btn" onClick={() => setBuild({ synergy: {} }, 'Cleared Synergy')}>Clear Synergy</button>}
      </div>
    </div>
    <div className="bp-tokenbar">
      <label className="bp-bonus" title="Bonus badge tokens from Season rewards and the like: one pool that covers any category's shortfall">Bonus tokens
        <input type="number" min={0} max={200} value={bonus} aria-label="Bonus badge tokens"
          onChange={e => setBonus(Math.max(0, Math.min(200, Math.trunc(Number(e.target.value)) || 0)))} /></label>
      <span className={need > bonus ? 'warn' : 'muted'}>{need ? <>Over budget by <b>{need}</b> across categories{bonus ? <> · bonus covers {Math.min(need, bonus)}</> : ''}
        {need > bonus && <> · <b>{need - bonus}</b> short: equip lower tiers or turn some off</>}</> : 'Every equipped badge fits in its category\'s tokens.'}</span>
      <span className="spacer" />
      <button className="mini-btn primary" onClick={metaPlan} title="Pick the tier (or none) for each badge that gives the most meta value within your tokens and bonus">Meta setup</button>
      <button className="mini-btn" disabled={!Object.keys(equip).length && !Object.keys(synergy).length}
        onClick={() => setBuild({ equip: {}, synergy: {} }, 'Reset badges')} title="Every badge back at its unlocked tier, no Synergy">Reset badges</button>
    </div>
    {over && <p className="warn small">More Synergy boosts planned than the slots you have.</p>}
    {syn.reactions > syn.fuses && <p className="warn small">Each Reaction badge needs its own Fuse badge to trigger it.</p>}
    {stale.length > 0 && <p className="muted small">Synergy on badges this build no longer unlocks is ignored: {stale.map(label).join(', ')}.</p>}
    <div className="bp-grid">{groups.map(g => {
      const list = eligible.filter(b => b.discipline === g && (showLocked || unlockedBy[b.name]));
      return <div key={g} className="bp-group">
        <h4 style={{ '--accent': disciplineColour(g) }}>{name(g)} <span className="muted">{eligible.filter(b => b.discipline === g && byName[b.name]).length}</span>
          <span className={'bp-budget' + (spent[g] > earned[g] ? ' over' : '')} title={`${name(g)} badge tokens: ${spent[g]} for the equipped badges, ${earned[g]} earned from your ${name(g)} ratings`
            + (spent[g] > earned[g] ? `. ${spent[g] - earned[g]} over: comes out of your bonus tokens.` : '')
            + (tokensEstimated(h) ? '. Estimated: HQ has no token data above 6′9″, so this uses 6′9″ values.' : '')}>{spent[g]}/{tokensEstimated(h) ? '≈' : ''}{earned[g]} tokens</span></h4>
        {list.length ? list.map(row) : <p className="muted small">None unlocked.</p>}
      </div>;
    })}</div>
    <p className="muted small bp-note"><b>Equip:</b> pick the tier you'll wear for each badge (– = off). The small number under each tier is its token
      price at your height. Each category's tokens are earned from its ratings; the bonus pool covers any category that goes over. <b>Meta setup</b> picks
      the tiers worth the most within your tokens. Synergy (2K27): +1 slots up to Legend, set how many you have above. Your Specialization adds one +2 slot for its own
      badges. Fuse badges are boosted all game and cost no tokens; a Reaction badge gets its boost once the Fuse it's paired with triggers enough times
      in a game. Each discipline has its own token budget, earned from that discipline's ratings (after Cap Breakers); the small numbers are what equipping it costs at
      Bronze, Silver, Gold and Hall of Fame at your height.</p>
  </section>;
}
