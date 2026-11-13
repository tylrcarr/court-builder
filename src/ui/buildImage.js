// Draws a full build — body, Overall, all 21 attributes and every unlocked badge — onto a canvas and returns a PNG
// blob, independent of what's scrolled into view.
import { attributes, feet, name, tiers } from '../engine.js';
import { applySynergy, groups, shownTiers } from '../derive.js';
import { archetypeName } from '../archetypes.js';

const C = {
  bg: '#0b0f17', card: '#121824', line: '#232d40', text: '#e8edf6', muted: '#8b97ad', accent: '#ff8a3d', lime: '#b6f23a',
  elite: '#b6f23a', great: '#4ade80', good: '#38bdf8', ok: '#94a3b8', low: '#64748b',
  bronze: '#c98549', silver: '#c7d0dc', gold: '#f5c542', hall_of_fame: '#b48cff', legend: '#ff8a3d',
};
const DISC = { finishing: '#ff8a3d', shooting: '#4ade80', playmaking: '#38bdf8', defense: '#a78bfa', rebounding: '#f472b6', physicals: '#facc15' };
const tone = v => v >= 90 ? C.elite : v >= 80 ? C.great : v >= 70 ? C.good : v >= 55 ? C.ok : C.low;
const label = key => key === 'hall_of_fame' ? 'Hall of Fame' : name(key);
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export function buildImage({ build, d, title = '', overall }) {
  const W = 1200, pad = 36, colW = (W - pad * 3) / 2, rowH = 30;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };

  // Badge chips are laid out first to know the image height.
  // Badges at their tier after planned Synergy (Fuse/Reaction boosts marked, e.g. "Pogostick +1").
  // Equipped tiers (Builder's badge picker: a lower tier, or 'off'), then planned Synergy.
  const top = u => u.tier, eq = build.equip ?? {};
  const equipped = d.unlocked.filter(u => eq[u.badge.name] !== 'off').map(u => ({ ...u,
    tier: eq[u.badge.name] && tiers.indexOf(eq[u.badge.name]) <= tiers.indexOf(top(u)) ? eq[u.badge.name] : u.tier }));
  const syn = applySynergy(equipped, build.synergy);
  const badgeRows = [];
  font(15, 600);
  for (const t of shownTiers.slice().reverse()) {
    const list = syn.rows.filter(u => u.shown === t).map(u => label(u.badge.name) + (u.boost ? ` +${u.boost}${u.reaction ? ' R' : ''}` : ''));
    if (list.length) badgeRows.push({ tier: t, list });
  }
  const chipLines = [];
  for (const row of badgeRows) {
    let x = pad + 130, line = [];
    for (const text of row.list) {
      const w = ctx.measureText(text).width + 22;
      if (x + w > W - pad && line.length) { chipLines.push({ tier: row.tier, line, first: chipLines.at(-1)?.tier !== row.tier }); line = []; x = pad + 130; }
      line.push({ text, x, w }); x += w + 8;
    }
    if (line.length) chipLines.push({ tier: row.tier, line, first: chipLines.at(-1)?.tier !== row.tier });
  }
  const left = ['finishing', 'shooting', 'playmaking'], right = groups.filter(g => !left.includes(g));
  const colHeight = list => list.reduce((s, g) => s + 34 + attributes.filter(a => a.discipline === g).length * rowH, 0);
  const attrTop = 170, attrH = Math.max(colHeight(left), colHeight(right));
  // Cap Breaker chart: every attribute's 5 steps for this archetype, applied ones lit (3 columns).
  const cbTop = attrTop + attrH + 30, cbRowH = 28, cbCols = 3, cbPer = Math.ceil(attributes.length / cbCols);
  const cbH = 44 + cbPer * cbRowH;
  const badgeTop = cbTop + cbH + 24;
  const H = badgeTop + 44 + chipLines.length * 34 + 50;
  canvas.width = W; canvas.height = H;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W * 0.85, -60, 10, W * 0.85, -60, 700);
  grad.addColorStop(0, 'rgba(255,90,31,0.18)'); grad.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // Header: title, build name, body, Overall.
  const { body } = build;
  ctx.textBaseline = 'alphabetic';
  font(14, 700); ctx.fillStyle = C.accent; ctx.fillText((title || 'MyPLAYER build').toUpperCase(), pad, pad + 14);
  font(34, 800); ctx.fillStyle = C.text; ctx.fillText(d.finalName ?? 'Unnamed build', pad, pad + 54);
  font(18, 500); ctx.fillStyle = C.muted;
  const specText = build.category ? ` · ${name(build.category)} specialization` : '';
  ctx.fillText(`${body.position} · ${feet(body.height)} · ${body.weight} lb · ${feet(body.wingspan)} wingspan · ${d.breakerCount} Cap Breakers${specText}`, pad, pad + 86);
  ctx.fillText(`${d.unlocked.length} badges · ${d.badgePoints} tier points`, pad, pad + 112);
  font(15, 800); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.fillText('OVR', W - pad, pad + 14);
  font(64, 900); ctx.fillStyle = overall >= 99 ? C.lime : C.text; ctx.fillText(String(overall), W - pad, pad + 78);
  ctx.textAlign = 'left';

  // Attributes, two columns.
  const drawColumn = (list, x) => {
    let y = attrTop;
    for (const g of list) {
      ctx.fillStyle = DISC[g]; ctx.fillRect(x, y + 4, 4, 16);
      font(14, 800); ctx.fillText(name(g).toUpperCase(), x + 12, y + 18);
      y += 34;
      for (const a of attributes.filter(a => a.discipline === g)) {
        const i = a.index, base = d.ratings[i], fin = d.final[i], cap = d.caps[i];
        font(16, 600); ctx.fillStyle = C.text; ctx.fillText(name(a.name), x, y + 15);
        const bx = x + 190, bw = colW - 190 - 120;
        ctx.fillStyle = '#1a2233'; roundRect(ctx, bx, y + 5, bw, 10, 5); ctx.fill();
        ctx.fillStyle = C.lime; roundRect(ctx, bx, y + 5, Math.max(4, (fin - 25) / 74 * bw), 10, 5); ctx.fill();
        ctx.fillStyle = tone(fin); roundRect(ctx, bx, y + 5, Math.max(4, (base - 25) / 74 * bw), 10, 5); ctx.fill();
        ctx.fillStyle = C.muted; ctx.fillRect(bx + (cap - 25) / 74 * bw - 1, y + 2, 2, 16);
        ctx.textAlign = 'right';
        font(20, 800); ctx.fillStyle = tone(fin); ctx.fillText(String(fin), x + colW - 52, y + 17);
        font(13, 500); ctx.fillStyle = C.muted; ctx.fillText(`/${cap}`, x + colW, y + 17);
        if (fin > base) { font(12, 700); ctx.fillStyle = C.lime; ctx.fillText(`${base}+${fin - base}`, x + colW - 88, y + 16); }
        ctx.textAlign = 'left';
        y += rowH;
      }
    }
  };
  drawColumn(left, pad);
  drawColumn(right, pad * 2 + colW);

  // Cap Breakers.
  ctx.fillStyle = C.line; ctx.fillRect(pad, cbTop - 14, W - pad * 2, 1);
  font(18, 800); ctx.fillStyle = C.text;
  ctx.fillText(`Cap Breakers (${d.breakerCount})`, pad, cbTop + 14);
  const titleW = ctx.measureText(`Cap Breakers (${d.breakerCount})`).width;
  font(14, 500); ctx.fillStyle = C.muted;
  ctx.fillText(`· ${d.height != null ? archetypeName(d.height, d.state.playerType) : ''} archetype · lit = applied`, pad + titleW + 10, cbTop + 14);
  const cbW = (W - pad * 2 - 24 * (cbCols - 1)) / cbCols;
  attributes.forEach((a, k) => {
    const col = Math.floor(k / cbPer), row = k % cbPer, i = a.index;
    const x = pad + col * (cbW + 24), y = cbTop + 40 + row * cbRowH;
    font(13, 600); ctx.fillStyle = d.applied[i] ? C.text : C.muted; ctx.fillText(name(a.name), x, y + 15);
    font(13, 800); ctx.fillStyle = tone(d.final[i]); ctx.textAlign = 'right';
    ctx.fillText(d.applied[i] ? `${d.ratings[i]}→${d.final[i]}` : String(d.final[i]), x + 150, y + 15); ctx.textAlign = 'left';
    const bx = x + 160, bw = (cbW - 160 - 4 * 4) / 5;
    d.ladders[i].forEach((gain, step) => {
      const on = step < d.applied[i];
      ctx.fillStyle = on ? 'rgba(182,242,58,0.18)' : '#161d2b'; roundRect(ctx, bx + step * (bw + 4), y + 1, bw, 20, 5); ctx.fill();
      if (on) { ctx.strokeStyle = 'rgba(182,242,58,0.6)'; ctx.lineWidth = 1; roundRect(ctx, bx + step * (bw + 4) + 0.5, y + 1.5, bw - 1, 19, 5); ctx.stroke(); }
      font(11, 700); ctx.fillStyle = on ? C.lime : gain ? C.muted : C.low; ctx.textAlign = 'center';
      ctx.fillText(gain ? `+${gain}` : '·', bx + step * (bw + 4) + bw / 2, y + 15); ctx.textAlign = 'left';
    });
  });

  // Badges by tier.
  ctx.fillStyle = C.line; ctx.fillRect(pad, badgeTop - 14, W - pad * 2, 1);
  font(18, 800); ctx.fillStyle = C.text; ctx.fillText(`Badges (${d.unlocked.length})`, pad, badgeTop + 14);
  let y = badgeTop + 40;
  for (const { tier, line, first } of chipLines) {
    if (first) { font(13, 800); ctx.fillStyle = C[tier]; ctx.fillText(label(tier).toUpperCase(), pad, y + 17); }
    for (const chip of line) {
      ctx.fillStyle = C.card; roundRect(ctx, chip.x, y, chip.w, 26, 13); ctx.fill();
      ctx.strokeStyle = C[tier]; ctx.lineWidth = 1; roundRect(ctx, chip.x + 0.5, y + 0.5, chip.w - 1, 25, 12.5); ctx.stroke();
      font(15, 600); ctx.fillStyle = C.text; ctx.fillText(chip.text, chip.x + 11, y + 18);
    }
    y += 34;
  }
  if (!chipLines.length) { font(15); ctx.fillStyle = C.muted; ctx.fillText('No badges unlocked.', pad, y + 14); }
  font(12); ctx.fillStyle = C.low; ctx.fillText('The Build Lab · NBA 2K27 MyPLAYER', pad, H - 18);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
