import { readBodyScreen, parseFeet, parseLbs } from './hq.mjs';
import { attributes, capsFor } from '../../src/engine.js';
const { caps, body } = readBodyScreen();
const b = { position: body.position.match(/PG|SG|SF|PF|C/)?.[0], height: parseFeet(body.height), weight: parseLbs(body.weight), wingspan: parseFeet(body.wingspan) };
console.log('screen body', JSON.stringify(body), '->', JSON.stringify(b));
const predicted = capsFor(b); const bad = [];
for (const { index, name } of attributes) if (caps[name] !== predicted[index]) bad.push(`${name}: HQ ${caps[name]} engine ${predicted[index]}`);
console.log('caps read', Object.keys(caps).length, '/ 21 | mismatches', bad.length, bad.join('; '));
