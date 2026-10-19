import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { readSessionToken, SESSION_COOKIE } from '@/lib/session';
import { loadRecord, parseRange } from '@/lib/record';
import { generateReport } from '@/lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const jar = await cookies();
  const claims = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!claims) {
    return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const range = parseRange(body?.range);
  const record = await loadRecord(range);

  // The patient consents to their data leaving for the model API separately
  // from consenting to share the record at all. Without that, generating the
  // report would send health data to a third party they never agreed to.
  if (!record.profile?.ai_report_consent_at) {
    return NextResponse.json(
      {
        error:
          'This patient has not enabled AI report generation. They can turn it on in the app under Settings.',
        code: 'no_consent',
      },
      { status: 403 },
    );
  }

  if (record.stats.daysLogged === 0) {
    return NextResponse.json(
      { error: 'There are no entries in this period to summarise.', code: 'no_data' },
      { status: 422 },
    );
  }

  try {
    const report = await generateReport(record.stats, record.profile.display_name);
    return NextResponse.json({ report, generatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report generation failed.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
