// Compact, URL-safe encoding of a build for share links: #b=<base64url>
import { attributes, positions } from './engine.js';

const POS = Object.keys(positions);

const synText = synergy => Object.entries(synergy ?? {}).map(([k, v]) => `${k}:${v.boost}${v.reaction ? 'r' : ''}`).join(',');
const synParse = text => Object.fromEntries((text ?? '').split(',').filter(Boolean).map(x => {
  const [k, v = ''] = x.split(':'); return [k, { boost: Number(v[0]) === 2 ? 2 : 1, ...(v.endsWith('r') ? { reaction: true } : {}) }];
}));

export function encodeBuild({ body, base, breakers = [], budget = 0, category = '', specialCount = 0, title = '', synergy = {} }) {
  const bytes = [POS.indexOf(body.position), body.height, body.weight - 100, body.wingspan,
    ...base, ...attributes.map((_, i) => breakers[i] ?? 0), budget, specialCount];
  const head = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const syn = synText(synergy);
  const tail = [category, title, ...(syn ? [syn] : [])].map(encodeURIComponent).join('~');
  return tail === '~' ? head : `${head}.${tail}`;
}

export function decodeBuild(code) {
  try {
    const [head, tail = '~'] = code.split('.');
    const raw = atob(head.replace(/-/g, '+').replace(/_/g, '/'));
    const b = [...raw].map(c => c.charCodeAt(0));
    const n = attributes.length;
    const [category = '', title = '', syn = ''] = tail.split('~').map(decodeURIComponent);
    const build = {
      body: { position: POS[b[0]], height: b[1], weight: b[2] + 100, wingspan: b[3] },
      base: b.slice(4, 4 + n), breakers: b.slice(4 + n, 4 + 2 * n), budget: b[4 + 2 * n] ?? 0,
      specialCount: b[5 + 2 * n] ?? 0, category, title, ...(syn ? { synergy: synParse(syn) } : {}),
    };
    return build.body.position && build.base.length === n ? build : null;
  } catch {
    return null;
  }
}

export const shareUrl = build => `${location.origin}${location.pathname}#b=${encodeBuild(build)}`;
