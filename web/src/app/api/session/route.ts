import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';

import { verifyCode, normalizeCode, TOTP_CODE_LENGTH } from '@/shared/totp';
import { serviceClient } from '@/lib/supabase';
import { issueSessionToken, sessionCookieOptions, SESSION_COOKIE, SESSION_MINUTES } from '@/lib/session';
import { checkRateLimit, recordAttempt, hashClient, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exchange a rotating access code for a short read-only session.
 *
 * The submitted code does not say who it belongs to, so every active secret has
 * to be tried. That is fine at this scale and it is also what keeps the
 * response uninformative: a wrong code and an unknown patient are the same
 * answer, so the endpoint cannot be used to discover whether a record exists.
 */
export async function POST(request: Request) {
  const ipHash = hashClient(clientIp(await headers()));

  const limit = await checkRateLimit(ipHash);
  if (!limit.allowed) {
    // Distinguish a genuine lockout from the limiter being unable to check. Both
    // block the request, but only one is the caller's doing.
    const unavailable = limit.reason === 'unavailable';
    return NextResponse.json(
      {
        error: unavailable
          ? 'The service is temporarily unavailable. Try again in a moment.'
          : 'Too many incorrect codes. Try again shortly.',
        retryAfter: limit.retryAfter,
      },
      {
        status: unavailable ? 503 : 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  }

  let submitted = '';
  try {
    const body = await request.json();
    submitted = normalizeCode(String(body?.code ?? ''));
  } catch {
    submitted = '';
  }

  if (submitted.length !== TOTP_CODE_LENGTH) {
    await recordAttempt(ipHash, false);
    return NextResponse.json({ error: 'Enter the 8-character code from the app.' }, { status: 400 });
  }

  const { data: secrets, error } = await serviceClient
    .from('totp_secrets')
    .select('user_id, secret')
    .is('revoked_at', null);

  if (error) {
    return NextResponse.json({ error: 'Could not verify the code. Try again.' }, { status: 503 });
  }

  // Check every secret rather than stopping at the first hit, so the time taken
  // does not depend on which patient matched.
  let matchedUserId: string | null = null;
  const now = Date.now();
  for (const row of secrets ?? []) {
    const secret = decodeSecret(row.secret);
    if (secret && verifyCode(secret, submitted, now)) {
      matchedUserId = row.user_id;
    }
  }

  if (!matchedUserId) {
    await recordAttempt(ipHash, false);
    return NextResponse.json(
      { error: 'That code is not valid. Codes change every minute — check the app for the current one.' },
      { status: 401 },
    );
  }

  const { token, expiresAt } = await issueSessionToken(matchedUserId);

  await recordAttempt(ipHash, true);
  await serviceClient.from('access_grants').insert({
    user_id: matchedUserId,
    expires_at: expiresAt.toISOString(),
    ip_hash: ipHash,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));

  return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString(), minutes: SESSION_MINUTES });
}

/** Sign out of the record view. */
export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}

/**
 * Postgres `bytea` arrives from PostgREST as a hex string like `\x0a1b...`.
 * Base64 is accepted too so the column can be changed to text without this
 * silently returning garbage that would fail every comparison.
 */
function decodeSecret(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (typeof value !== 'string') return null;

  if (value.startsWith('\\x')) {
    const hex = value.slice(2);
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  try {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  } catch {
    return null;
  }
}
