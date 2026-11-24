import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { accessKeys, matchesArt, verifyArtPassword } from '../src/utils/art-access.js';

const art = { medium: 'Oil', year: 2025, month: 1 };
assert(matchesArt(art, [], '', false));
assert(matchesArt(art, ['Oil', 'Ink'], 'available', false));
assert(!matchesArt(art, ['Ink'], '', false));
assert(!matchesArt({ ...art, status: ' Sold ' }, [], 'available', false));
assert(matchesArt({ ...art, status: ' Sold ' }, [], 'sold', false));
assert(!matchesArt({ ...art, visibility: 'private' }, [], '', false));
assert(matchesArt({ ...art, visibility: 'private' }, [], '', true));
assert(!matchesArt({ ...art, visibility: 'private' }, ['Ink'], '', true));
// Use a temporary known verifier to exercise the browser algorithm against Node's PBKDF2.
const original = accessKeys.splice(0);
const salt = '00112233445566778899aabbccddeeff';
accessKeys.push({ salt, iterations: 600000, hash: pbkdf2Sync('test-password', Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex') });
assert(await verifyArtPassword('test-password'));
assert(!await verifyArtPassword('wrong-password'));
accessKeys.splice(0, accessKeys.length, ...original);
console.log('Art filtering and password checks passed.');
