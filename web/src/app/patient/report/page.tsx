import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { loadRecord, parseRange } from '@/lib/record';
import { ReportView } from '@/components/report-view';
import { ThemeToggle } from '@/components/theme-provider';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);
  const record = await loadRecord(range);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/patient?range=${range}`}
            className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm text-muted transition-colors duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <ArrowLeft size={14} strokeWidth={1.5} />
            Back to record
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Consultation summary</h1>
          <p className="mt-1 text-sm text-muted">
            {record.profile?.display_name ?? 'Patient'} · {formatDate(record.from)} –{' '}
            {formatDate(record.to)} · {record.stats.daysLogged} days logged
          </p>
        </div>
        <ThemeToggle />
      </header>

      <ReportView
        range={range}
        hasConsent={Boolean(record.profile?.ai_report_consent_at)}
        daysLogged={record.stats.daysLogged}
        patientName={record.profile?.display_name ?? 'Patient'}
        periodLabel={`${formatDate(record.from)} – ${formatDate(record.to)}`}
      />
    </main>
  );
}
