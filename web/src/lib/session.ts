import { SignJWT, jwtVerify } from 'jose';

// A verified code buys a short, read-only, single-patient session. The cookie
// is the only thing that names the patient — no page or route may take a user
// id from a URL or form field, or the code check would be decorative.

export const SESSION_COOKIE = 'record_session';
export const SESSION_MINUTES = 30;

const ISSUER = 'yochipls/web';
const AUDIENCE = 'clinician-view';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_JWT_SECRET must be set to at least 32 characters. See .env.example.');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  /** The patient whose record this session may read. */
  sub: string;
  /** Unix seconds. */
  exp: number;
}

export async function issueSessionToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
  const token = await new SignJWT({ scope: 'read' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  return { token, expiresAt };
}

/** Returns null for anything not a currently valid session. */
export async function readSessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub || payload.scope !== 'read' || typeof payload.exp !== 'number') return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = (expiresAt: Date) =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    expires: expiresAt,
  });
