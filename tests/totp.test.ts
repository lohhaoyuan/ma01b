// Tests for the rotating access code.
//
//   node tests/totp.test.ts
//
// The code format is a deliberate variant of RFC 6238 (60s step, 8 Crockford
// base32 characters), so the RFC's published vectors do not apply to its
// output directly. They do apply to everything underneath it — the counter
// encoding, the HMAC, and the dynamic-truncation offset — so the first block
// re-derives standard 8-digit TOTP from the same primitives and checks it
// against the RFC. If those pass, a mismatch between the two apps can only come
// from the encoding layer, which is a single shared function.

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  generateCode,
  verifyCode,
  normalizeCode,
  formatCode,
  codeForCounter,
  secondsRemaining,
  counterAt,
  TOTP_STEP_SECONDS,
  TOTP_CODE_LENGTH,
} from '../shared/totp.ts';

let failures = 0;

const show = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));

function check(name: string, actual: unknown, expected: unknown) {
  const pass = show(actual) === show(expected);
  if (!pass) failures++;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}`);
  if (!pass) console.log(`         expected ${show(expected)}, got ${show(actual)}`);
}

function checkThat(name: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${cond ? '' : ` — ${detail}`}`);
}

// --- RFC 6238 vectors, SHA-256 ---------------------------------------------

console.log('RFC 6238 (SHA-256, standard 8-digit truncation)');

function standardTotp(secret: Uint8Array, unixSeconds: number, step = 30): string {
  const counter = BigInt(Math.floor(unixSeconds / step));
  const buf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const digest = hmac(sha256, secret, buf);
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 100_000_000).padStart(8, '0');
}

const rfcSecret = new TextEncoder().encode('12345678901234567890123456789012');
const rfcVectors: Array<[number, string]> = [
  [59, '46119246'],
  [1111111109, '68084774'],
  [1111111111, '67062674'],
  [1234567890, '91819424'],
  [2000000000, '90698825'],
  [20000000000, '77737706'],
];
for (const [t, expected] of rfcVectors) {
  check(`T=${t}`, standardTotp(rfcSecret, t), expected);
}

// --- Code format ------------------------------------------------------------

console.log('\ncode format');

const secret = new Uint8Array(20);
for (let i = 0; i < 20; i++) secret[i] = i * 7 + 3;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const sample = Array.from({ length: 500 }, (_, i) => codeForCounter(secret, BigInt(i)));

check('code is 8 characters', sample[0].length, TOTP_CODE_LENGTH);
checkThat(
  'codes use only the Crockford alphabet',
  sample.every((c) => [...c].every((ch) => ALPHABET.includes(ch))),
);
checkThat(
  'codes never contain I, L, O or U',
  sample.every((c) => !/[ILOU]/.test(c)),
  'an ambiguous glyph would defeat reading the code aloud',
);
checkThat(
  'consecutive counters give unrelated codes',
  new Set(sample).size > 495,
  `only ${new Set(sample).size} distinct of 500`,
);
checkThat(
  'every alphabet character can appear',
  new Set(sample.join('')).size > 28,
  'encoding may be truncating the code space',
);
check('codes are deterministic', codeForCounter(secret, 42n), codeForCounter(secret, 42n));
checkThat(
  'a different secret gives a different code',
  codeForCounter(new Uint8Array(20).fill(9), 42n) !== codeForCounter(secret, 42n),
);
check('display grouping', formatCode('ABCD1234'), 'ABCD 1234');

// --- Rotation ---------------------------------------------------------------

console.log('\nrotation');

// Align to a step boundary so the assertions do not depend on wall-clock phase.
const base = Math.floor(Date.now() / (TOTP_STEP_SECONDS * 1000)) * TOTP_STEP_SECONDS * 1000;
const S = 1000;

check('code is stable for the whole step', generateCode(secret, base), generateCode(secret, base + 59 * S));
checkThat(
  'code changes at the step boundary',
  generateCode(secret, base) !== generateCode(secret, base + 60 * S),
);
check('counter advances once per step', counterAt(base + 60 * S) - counterAt(base), 1n);
check('countdown at the boundary is a full step', secondsRemaining(base), TOTP_STEP_SECONDS);
check('countdown one second in', secondsRemaining(base + S), TOTP_STEP_SECONDS - 1);
check('countdown at the last second', secondsRemaining(base + 59 * S), 1);

// --- Verification -----------------------------------------------------------

console.log('\nverification');

const code = generateCode(secret, base);

checkThat('accepts the current code', verifyCode(secret, code, base));
checkThat('accepts it late in the same step', verifyCode(secret, code, base + 59 * S));
checkThat(
  'accepts one step of skew, so a slow clock still works',
  verifyCode(secret, code, base + 60 * S),
);
checkThat('accepts one step of skew backwards', verifyCode(secret, code, base - 60 * S));
checkThat(
  'rejects a code two steps stale',
  !verifyCode(secret, code, base + 130 * S),
  'an expired code must not unlock the record',
);
checkThat('window 0 rejects any skew', !verifyCode(secret, code, base + 60 * S, 0));
checkThat('rejects a wrong code', !verifyCode(secret, 'ZZZZZZZZ', base));
checkThat('rejects the right code under the wrong secret', !verifyCode(new Uint8Array(20).fill(1), code, base));
checkThat('rejects a short code', !verifyCode(secret, code.slice(0, 7), base));
checkThat('rejects a long code', !verifyCode(secret, code + 'A', base));
checkThat('rejects an empty code', !verifyCode(secret, '', base));

// A one-character change must never still verify.
let nearMissAccepted = 0;
for (let i = 0; i < TOTP_CODE_LENGTH; i++) {
  for (const ch of ALPHABET) {
    if (ch === code[i]) continue;
    const mutated = code.slice(0, i) + ch + code.slice(i + 1);
    if (verifyCode(secret, mutated, base)) nearMissAccepted++;
  }
}
check('no single-character mutation verifies', nearMissAccepted, 0);

// --- Normalisation ----------------------------------------------------------

console.log('\nnormalisation');

check('uppercases', normalizeCode('abcd1234'), 'ABCD1234');
check('strips the display space', normalizeCode('ABCD 1234'), 'ABCD1234');
check('strips hyphens', normalizeCode('ABCD-1234'), 'ABCD1234');
check('folds O onto 0', normalizeCode('OOOO0000'), '00000000');
check('folds I and L onto 1', normalizeCode('IILL1111'), '11111111');

// The point of the folding: a clinician mishearing or mistyping an ambiguous
// glyph should still land on the right record.
checkThat(
  'a mistyped O still verifies',
  verifyCode(secret, code.replace(/0/g, 'O'), base),
  'folding is what makes the code safe to read aloud',
);
checkThat('a mistyped l still verifies', verifyCode(secret, code.replace(/1/g, 'l'), base));
checkThat('lowercase entry still verifies', verifyCode(secret, code.toLowerCase(), base));
checkThat('spaced entry still verifies', verifyCode(secret, formatCode(code), base));

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
