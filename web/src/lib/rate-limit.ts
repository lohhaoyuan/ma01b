import 'server-only';

import { createHash } from 'node:crypto';
import { serviceClient } from './supabase';

// The code space is 32^8, so brute force is not the main worry — an online
// attacker getting unlimited tries at a code that changes every 60 seconds is.
// Attempts are counted per client, in Postgres, so the limit survives a restart
// and holds across serverless instances (an in-memory Map would do neither).

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;
const LOCKOUT_MINUTES = 15;

/**
 * IPs are hashed before storage. The rate limiter needs to recognise a repeat
 * client, not to know who they are, and this is a health application — the raw
 * address never has to be written down.
 */
export function hashClient(ip: string): string {
  const pepper = process.env.SESSION_JWT_SECRET ?? '';
  return createHash('sha256').update(`${ip}:${pepper}`).digest('hex').slice(0, 32);
}

/** Best-effort client address behind a proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller may try again. Only meaningful when blocked. */
  retryAfter: number;
  remaining: number;
  /**
   * Why the request was blocked. 'locked' is a real lockout; 'unavailable'
   * means the attempt log could not be read, so the limiter refused rather than
   * waving the request through. The caller must not conflate the two — telling
   * someone they have made too many attempts when the database is down sends
   * them off to wait out a lockout that does not exist.
   */
  reason?: 'locked' | 'unavailable';
}

export async function checkRateLimit(ipHash: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await serviceClient
    .from('code_attempts')
    .select('attempted_at, succeeded')
    .eq('ip_hash', ipHash)
    .gte('attempted_at', since)
    .order('attempted_at', { ascending: false });

  // Fail closed. If the attempt log cannot be read, the limiter cannot do its
  // job, and allowing unlimited guesses is the worse of the two failures.
  if (error) {
    return { allowed: false, retryAfter: 60, remaining: 0, reason: 'unavailable' };
  }

  const failures = (data ?? []).filter((row) => !row.succeeded);
  if (failures.length < MAX_ATTEMPTS) {
    return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS - failures.length };
  }

  const newest = new Date(failures[0].attempted_at).getTime();
  const unlocksAt = newest + LOCKOUT_MINUTES * 60 * 1000;
  const retryAfter = Math.max(0, Math.ceil((unlocksAt - Date.now()) / 1000));

  if (retryAfter === 0) return { allowed: true, retryAfter: 0, remaining: MAX_ATTEMPTS };
  return { allowed: false, retryAfter, remaining: 0, reason: 'locked' };
}

export async function recordAttempt(ipHash: string, succeeded: boolean): Promise<void> {
  await serviceClient.from('code_attempts').insert({ ip_hash: ipHash, succeeded });
}
