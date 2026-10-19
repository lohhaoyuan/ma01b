import 'server-only';

import { createClient } from '@supabase/supabase-js';

// The clinician app never authenticates as the patient. It verifies a rotating
// code, then reads through the service role, scoped in code to the single
// user_id that the verified session cookie names.
//
// The service role bypasses RLS, so every query in this app MUST be filtered by
// the user id taken from the verified cookie — never from a request parameter.
// `patientScopedClient` exists to make that the path of least resistance.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. See .env.example.',
  );
}

export const serviceClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * A thin wrapper that pins every read to one patient. Prefer this over
 * `serviceClient` in page and route code.
 */
export function patientScopedClient(userId: string) {
  return {
    from(table: string) {
      return serviceClient.from(table).select().eq('user_id', userId);
    },
    /** Escape hatch for writes and joins; callers must scope these themselves. */
    raw: serviceClient,
    userId,
  };
}
