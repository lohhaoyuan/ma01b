import { NextResponse, type NextRequest } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/session';

// The record view is unreachable without a currently valid session cookie.
// Pages verify the cookie again when they read data — this is the cheap early
// redirect, not the security boundary.
//
// Next 16 renamed the `middleware` convention to `proxy`, and the proxy runtime
// is always nodejs, which is what the jose verification here needs anyway.

export async function proxy(request: NextRequest) {
  const claims = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!claims) {
    const url = new URL('/', request.url);
    url.searchParams.set('expired', '1');
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/patient/:path*'],
};
