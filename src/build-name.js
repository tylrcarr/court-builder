import observedNames from './observed-build-names.json' with { type: 'json' };
import table from './build-names.json' with { type: 'json' };
import { attributes } from './engine.js';

const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
const physical = attributes.map(attribute => attribute.discipline === 'physicals');
const scored = attributes.map(attribute => attribute.index).filter(index => index !== 7);

function decodeUint16(encoded) {
  const bytes = atob(encoded);
  return Uint16Array.from({ length: bytes.length / 2 }, (_, i) =>
    bytes.charCodeAt(2 * i) | bytes.charCodeAt(2 * i + 1) << 8);
}

const rows = decodeUint16(table.index);
const tuples = decodeUint16(table.tuples);
const choices = Array.from({ length: 21 }, (_, n) => {
  const row = [1];
  for (let k = 1; k <= n; k++) row.push(Math.round(row[k - 1] * (n - k + 1) / k));
  return row;
});

function maskRow(mask) {
  let rank = 0, used = 0;
  for (let bit = 19; bit >= 0; bit--) {
    if (!(mask & (1 << bit))) continue;
    for (let count = Math.max(0, 2 - used); count <= Math.min(7 - used, bit); count++) {
      rank += choices[bit][count];
    }
    used++;
  }
  return rank - Number(mask > table.gapMask) + Number(mask > table.dupMask);
}

function definingMask(ratings, position) {
  const threshold = table.thresholds.map(row => row[position]);
  const priority = table.priority[position];
  const rate = () => scored.map(index => ({
    index, value: ratings[index], threshold: threshold[index], margin: ratings[index] - threshold[index],
  }));
  let ranked = rate();
  const qualifying = () => ranked.filter(item => item.margin >= 0).length;
  const initial = qualifying();

  // Adjust physical and non-physical thresholds separately when the initial
  // profile has too many or too few defining attributes.
  function shift(count, shiftPhysical) {
    for (const index of scored) {
      if (physical[index] === shiftPhysical) threshold[index] += count <= 7 ? -1 : 1;
    }
    ranked = rate().sort((a, b) => b.margin - a.margin);
    let qualified = qualifying();
    if (count < 8 || qualified > 6) return qualified;

    // When a threshold step drops several tied attributes at once, keep
    // enough of the tied group to preserve the game's naming range.
    ranked.sort((a, b) => Number(physical[b.index] === shiftPhysical) -
      Number(physical[a.index] === shiftPhysical) || b.value - a.value || a.threshold - b.threshold);
    let cursor = 0;
    while (cursor < 20 && qualified <= 6) {
      const item = ranked[cursor];
      if (physical[item.index] !== shiftPhysical || item.margin !== -1) {
        cursor++;
        continue;
      }
      item.margin = 0;
      qualified++;
      let last = cursor;
      while (last + 1 < ranked.length) {
        const next = ranked[last + 1];
        if (next.margin !== -1 || next.value !== item.value || next.threshold !== item.threshold) break;
        if (physical[next.index] !== shiftPhysical) return qualified;
        ranked[last].margin = 0;
        last++;
        qualified++;
      }
      cursor = last + 1;
    }
    return qualified;
  }

  let count = initial;
  if (initial >= 8) {
    for (let pass = 0; count >= 8 && pass < 160; pass++) {
      count = shift(count, true);
      if (count >= 8 && pass % 2 === 1) count = shift(count, false);
    }
  } else if (initial <= 2) {
    for (let pass = 0; pass < 160; pass++) {
      for (let step = 0; step < 3 && count <= 2; step++) count = shift(count, false);
      if (count < 3) count = shift(count, true);
      if (count >= (pass === 0 ? 3 : 2)) break;
    }
  }
  const size = Math.max(3, Math.min(7, initial >= 3 && initial <= 7 ? initial : count));
  ranked.sort((a, b) => b.margin - a.margin || priority[a.index] - priority[b.index]);
  return ranked.slice(0, size).reduce((mask, { index }) => mask | 1 << (index > 7 ? index - 1 : index), 0);
}

export function reportedBuildName(position, ratings) {
  return observedNames.find(observation => observation.position === position &&
    observation.ratings.every((value, i) => i === 7 || value === ratings[i]))?.name ?? null;
}

export function buildName(position, ratings) {
  const reported = reportedBuildName(position, ratings);
  if (reported) return reported;
  const positionIndex = positions.indexOf(position);
  if (positionIndex < 0 || ratings.length !== attributes.length) return null;
  const mask = definingMask(ratings, positionIndex);
  if (mask === table.gapMask) return null;
  return table.names[tuples[rows[maskRow(mask)] * 5 + positionIndex]] || null;
}



