import * as Crypto from 'expo-crypto';

import { store, supabase } from './supabase';
import { TOTP_SECRET_BYTES } from '../shared/totp';

// The secret behind the rotating access code.
//
// It is generated on the device, stored in the keychain, and mirrored to
// Supabase so the web app can verify codes. Codes themselves are computed
// offline from the cached copy, so the share screen keeps working with no
// signal — which matters in a consulting room.

const CACHE_KEY = 'totp.secret';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Fetch the patient's secret, creating one on first use.
 *
 * The cached copy is authoritative for generating codes, but it is checked
 * against the server on every load: if the patient revoked the secret from
 * another device, a stale cache would keep showing codes that no longer open
 * anything, which looks like the web app is broken.
 */
export async function getOrCreateSecret(userId: string): Promise<Uint8Array> {
  const { data: row } = await supabase
    .from('totp_secrets')
    .select('secret, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (row && !row.revoked_at) {
    const secret = fromHex(String(row.secret));
    await store.set(CACHE_KEY, toHex(secret));
    return secret;
  }

  // No usable secret on the server. If we are offline the fetch above returns
  // no row too, so fall back to the cache rather than minting a second secret
  // that the server has never seen.
  const cached = await store.get(CACHE_KEY);
  if (cached && !row) return fromHex(cached);

  return rotateSecret(userId);
}

/** Generate a fresh secret, invalidating every code the old one produced. */
export async function rotateSecret(userId: string): Promise<Uint8Array> {
  const secret = Crypto.getRandomBytes(TOTP_SECRET_BYTES);
  const hex = toHex(secret);

  const { error } = await supabase
    .from('totp_secrets')
    .upsert({ user_id: userId, secret: `\\x${hex}`, revoked_at: null }, { onConflict: 'user_id' });

  if (error) throw new Error('Could not update the sharing code. Check your connection.');

  await store.set(CACHE_KEY, hex);
  return secret;
}

/** Stop all sharing. Existing web sessions still run until they expire. */
export async function revokeSecret(userId: string): Promise<void> {
  const { error } = await supabase
    .from('totp_secrets')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw new Error('Could not revoke sharing. Check your connection.');
  await store.remove(CACHE_KEY);
}
