import Link from 'next/link';
import { FileText } from 'lucide-react';

import { loadRecord, parseRange } from '@/lib/record';
import { severityColor, severityBand, DOMAINS } from '@/shared/symptoms';
import { SeverityChart, DomainSparkline, EpisodeStrip } from '@/components/charts';
import {
  StatTile,
  RangePicker,
  SessionCountdown,
  StreakBanner,
  LogTable,
} from '@/components/dashboard-parts';
import { ThemeToggle } from '@/components/theme-provider';
import { formatDate } from '@/lib/format';
import { RANGE_LABELS } from '@/shared/types';

export const dynamic = 'force-dynamic';

export default async function PatientPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const range = parseRange((await searchParams).range);
  const record = await loadRecord(range);
  const { stats, profile, logs, medications, episodes, streak } = record;

  const severitySeries = logs.map((l) => ({ date: l.log_date, severity: l.severity }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {profile?.display_name ?? 'Patient record'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(record.from)} – {formatDate(record.to)} · {stats.daysLogged} of{' '}
            {stats.daysInRange} days logged ({stats.adherence}%)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SessionCountdown expiresAt={record.expiresAt} />
          <ThemeToggle />
        </div>
      </header>

      {streak && streak.current_streak_days >= 7 && (
        <div className="mt-6">
          <StreakBanner days={streak.current_streak_days} since={streak.streak_started_on} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <RangePicker current={range} />
        <Link
          href={`/patient/report?range=${range}`}
          className="no-print flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-contrast transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none"
        >
          <FileText size={15} strokeWidth={1.5} />
          Consultation report
        </Link>
      </div>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Mean severity"
          value={stats.severityMean === null ? '—' : String(stats.severityMean)}
          detail={stats.severityMean === null ? 'No entries' : severityBand(stats.severityMean)}
          accentColor={stats.severityMean === null ? undefined : severityColor(stats.severityMean)}
        />
        <StatTile
          label="Worst day"
          value={stats.worstDay ? String(stats.worstDay.severity) : '—'}
          detail={stats.worstDay ? formatDate(stats.worstDay.date) : undefined}
          accentColor={stats.worstDay ? severityColor(stats.worstDay.severity) : undefined}
        />
        <StatTile
          label="Elevated days"
          value={String(stats.elevatedDays)}
          detail={`longest run ${stats.longestEpisode}`}
        />
        <StatTile
          label="Worst domain"
          value={stats.worstDomain?.mean?.toFixed(1) ?? '—'}
          detail={stats.worstDomain?.label ?? 'No entries'}
        />
        <StatTile
          label="Missed work/school"
          value={String(stats.daysMissedWork)}
          detail={`of ${stats.daysLogged} logged days`}
        />
        <StatTile
          label="Medication days"
          value={String(stats.medicationDays)}
          detail={
            stats.medicationsTaken.length > 0
              ? stats.medicationsTaken
                  .slice(0, 2)
                  .map((m) => m.name)
                  .join(', ')
              : `of ${stats.daysLogged} logged days`
          }
        />
      </section>

      <section className="mt-6 rounded-lg border border-line bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium tracking-tight text-ink">
            Composite severity, {RANGE_LABELS[range].toLowerCase()}
          </h2>
          <p className="text-xs text-muted">0–100, weighted across all recorded symptoms</p>
        </div>
        <SeverityChart data={severitySeries} />

        {episodes.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-xs text-muted">
              Elevated episodes across the full history ({episodes.length})
            </p>
            <EpisodeStrip
              episodes={episodes}
              from={episodes[0].started_on}
              to={record.to}
            />
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium tracking-tight text-ink">By symptom</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DOMAINS.map((domain) => {
            const summary = stats.domains.find((d) => d.key === domain.key)!;
            return (
              <DomainSparkline
                key={domain.key}
                summary={summary}
                data={logs.map((l) => ({ date: l.log_date, value: l[domain.key] }))}
              />
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium tracking-tight text-ink">Daily entries</h2>
        <LogTable logs={[...logs].reverse()} medications={medications} />
      </section>

      <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Self-reported symptom data recorded by the patient. Read-only access, granted by the patient
        and logged in their app.
      </footer>
    </main>
  );
}
