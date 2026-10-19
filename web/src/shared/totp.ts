// GENERATED FILE — do not edit.
// Copied from shared/totp.ts by scripts/sync-shared.mjs. Edit the canonical file
// at the repo root and run `npm run sync:shared`.

// Rotating access code shared between the patient app and the clinician web app.
//
// CANONICAL SOURCE. Do not edit the copies under mobile/src/shared or
// web/src/shared — run `npm run sync:shared` from the repo root instead.
//
// This is RFC 6238 TOTP with two deliberate departures from the defaults:
//
//   * A 60-second step rather than 30, matching the "refreshes every minute"
//     requirement.
//   * The dynamic-truncation value is rendered as 8 Crockford base32 characters
//     rather than 6 decimal digits. Crockford's alphabet already omits I, L, O
//     and U, so a code read aloud to a clinician over the phone cannot be
//     transcribed into a different valid code. 32^8 is 2^40, so the truncation
//     takes 40 bits and the encoding is exactly onto the code space — no
//     modulo bias, and no wasted entropy.
//
// Both apps import this same file, so there is one implementation of the
// algorithm rather than two that have to be kept in agreement.
//
// @noble/hashes is pinned to one exact version in every project that imports
// this file. A caret range would let the two apps resolve different builds of
// the hash, and a code generated on the phone would stop verifying on the web.

import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const TOTP_STEP_SECONDS = 60;
export const TOTP_CODE_LENGTH = 8;
export const TOTP_SECRET_BYTES = 20;

/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Counter for a given instant: the number of whole steps since the epoch. */
export function counterAt(atMs: number = Date.now()): bigint {
  return BigInt(Math.floor(atMs / 1000 / TOTP_STEP_SECONDS));
}

/** Whole seconds until the current code is replaced. */
export function secondsRemaining(atMs: number = Date.now()): number {
  const elapsed = Math.floor(atMs / 1000) % TOTP_STEP_SECONDS;
  return TOTP_STEP_SECONDS - elapsed;
}

function counterBytes(counter: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  return buf;
}

/** The code for one specific counter value. */
export function codeForCounter(secret: Uint8Array, counter: bigint): string {
  const digest = hmac(sha256, secret, counterBytes(counter));

  // RFC 6238 dynamic truncation, widened from 4 bytes to 5 so the value covers
  // the full 40-bit code space. offset is at most 15 and the digest is 32
  // bytes, so reading 5 bytes never runs off the end.
  const offset = digest[digest.length - 1] & 0x0f;
  let value = 0n;
  for (let i = 0; i < 5; i++) {
    value = (value << 8n) | BigInt(digest[offset + i]);
  }

  let out = '';
  for (let i = 0; i < TOTP_CODE_LENGTH; i++) {
    out = ALPHABET[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}

/** The code valid at a given instant. */
export function generateCode(secret: Uint8Array, atMs: number = Date.now()): string {
  return codeForCounter(secret, counterAt(atMs));
}

/**
 * Fold the ambiguous glyphs a person might type back onto the alphabet, so a
 * clinician reading the code off a phone screen isn't defeated by O-versus-0.
 * Whitespace and hyphens are stripped: the app displays the code in two groups
 * of four and people reproduce that grouping.
 */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/** Comparison whose duration does not depend on where the first difference is. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Check a submitted code, tolerating `window` steps of clock skew on either
 * side. Every candidate is compared even after a match is found, so the time
 * taken reveals nothing about which step matched or how close a wrong code was.
 */
export function verifyCode(
  secret: Uint8Array,
  submitted: string,
  atMs: number = Date.now(),
  window: number = 1,
): boolean {
  const candidate = normalizeCode(submitted);
  if (candidate.length !== TOTP_CODE_LENGTH) return false;

  const now = counterAt(atMs);
  let matched = false;
  for (let offset = -window; offset <= window; offset++) {
    if (constantTimeEquals(codeForCounter(secret, now + BigInt(offset)), candidate)) {
      matched = true;
    }
  }
  return matched;
}

/** Display form: two groups of four. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}
