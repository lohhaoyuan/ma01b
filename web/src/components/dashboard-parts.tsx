'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, TriangleAlert } from 'lucide-react';
import { severityColor, severityBand, ratingColor, DOMAINS } from '@/shared/symptoms';
import type { SymptomLog, Medication, RangeKey } from '@/shared/types';
import { RANGE_LABELS } from '@/shared/types';
import { formatDate } from '@/lib/format';

export function StatTile({
  label,
  value,
  detail,
  accentColor,
}: {
  label: string;
  value: string;
  detail?: string;
  accentColor?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1.5 flex items-center gap-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">
        {accentColor && (
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
        )}
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </div>
  );
}

export function RangePicker({ current }: { current: RangeKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(range: RangeKey) {
    const next = new URLSearchParams(params);
    next.set('range', range);
    router.push(`${pathname}?${next}`);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      className="no-print inline-flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5"
    >
      {(Object.keys(RANGE_LABELS) as RangeKey[]).map((range) => (
        <button
          key={range}
          type="button"
          role="radio"
          aria-checked={current === range}
          onClick={() => select(range)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
            current === range
              ? 'bg-accent font-medium text-accent-contrast'
              : 'text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
          }`}
        >
          {RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

/**
 * A visible countdown. The session ends after 30 minutes whether or not anyone
 * is watching, so it is better for a clinician to see it coming than to lose a
 * half-read record to a silent redirect.
 */
export function SessionCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => secondsUntil(expiresAt));

  useEffect(() => {
    const id = setInterval(() => {
      const next = secondsUntil(expiresAt);
      setRemaining(next);
      if (next <= 0) router.replace('/?expired=1');
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, router]);

  const minutes = Math.floor(Math.max(0, remaining) / 60);
  const seconds = Math.max(0, remaining) % 60;
  const low = remaining <= 120;

  return (
    <div className="no-print flex items-center gap-3">
      <span
        className={`font-mono text-xs tabular-nums ${low ? 'text-ink' : 'text-muted'}`}
        title="Time left in this read-only session"
      >
        {low && 'ends in '}
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={async () => {
          await fetch('/api/session', { method: 'DELETE' });
          router.replace('/');
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted transition-colors duration-150 hover:bg-zinc-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:hover:bg-zinc-800/60"
      >
        <LogOut size={14} strokeWidth={1.5} />
        Close
      </button>
    </div>
  );
}

function secondsUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 1000);
}

export function StreakBanner({ days, since }: { days: number; since: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4">
      <TriangleAlert size={17} strokeWidth={1.5} className="mt-px shrink-0 text-accent" />
      <div>
        <p className="text-sm font-medium tracking-tight text-ink">
          Symptoms have been elevated for {days} consecutive days
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Since {formatDate(since)}, every logged day has scored at or above the elevated
          threshold. This is a summary of what the patient recorded, not a clinical finding.
        </p>
      </div>
    </div>
  );
}

export function LogTable({
  logs,
  medications,
}: {
  logs: SymptomLog[];
  medications: Medication[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const medsByLog = new Map<string, Medication[]>();
  for (const med of medications) {
    if (!medsByLog.has(med.log_id)) medsByLog.set(med.log_id, []);
    medsByLog.get(med.log_id)!.push(med);
  }

  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
        No entries in this range.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-card text-left">
            <th scope="col" className="px-4 py-2.5 font-medium text-muted">Date</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium text-muted">Score</th>
            {DOMAINS.map((d) => (
              <th
                key={d.key}
                scope="col"
                className="px-2 py-2.5 text-center font-medium text-muted"
                title={d.label}
              >
                {abbreviate(d.label)}
              </th>
            ))}
            <th scope="col" className="px-3 py-2.5 text-center font-medium text-muted" title="Missed work or school">
              Off
            </th>
            <th scope="col" className="px-3 py-2.5 text-center font-medium text-muted" title="Took pain medication">
              Med
            </th>
            <th scope="col" className="w-8 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const meds = medsByLog.get(log.id) ?? [];
            const hasDetail = Boolean(log.notes?.trim()) || meds.length > 0;
            const open = expanded === log.id;

            return (
              <tr key={log.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-ink">{formatDate(log.log_date)}</td>
                <td className="px-3 py-2.5 text-right">
                  {log.severity === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-ink">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: severityColor(log.severity) }}
                      />
                      {log.severity}
                    </span>
                  )}
                </td>
                {DOMAINS.map((d) => {
                  const value = log[d.key];
                  return (
                    <td key={d.key} className="px-2 py-2.5 text-center">
                      {value === null || value === undefined ? (
                        <span className="text-muted" title="Not applicable or skipped">n/a</span>
                      ) : (
                        <span
                          className="font-mono tabular-nums text-ink"
                          style={{ color: value >= 7 ? ratingColor(value) : undefined }}
                        >
                          {value}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center text-ink">{log.missed_work ? 'Yes' : '—'}</td>
                <td className="px-3 py-2.5 text-center text-ink">{log.took_pain_medication ? 'Yes' : '—'}</td>
                <td className="px-2 py-2.5">
                  {hasDetail && (
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : log.id)}
                      aria-expanded={open}
                      aria-label={open ? 'Hide notes' : 'Show notes'}
                      className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-zinc-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none dark:hover:bg-zinc-800/60"
                    >
                      <ChevronDown size={14} strokeWidth={1.5} className={open ? 'rotate-180' : ''} />
                    </button>
                  )}
                </td>

                {open && (
                  <td colSpan={DOMAINS.length + 5} className="px-4 pt-0 pb-3">
                    <div className="rounded-md border border-line bg-card p-3">
                      {meds.length > 0 && (
                        <p className="text-sm text-ink">
                          <span className="text-muted">Medication: </span>
                          {meds.map((m) => (m.dose ? `${m.name} (${m.dose})` : m.name)).join(', ')}
                        </p>
                      )}
                      {log.notes?.trim() && (
                        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                          {log.notes.trim()}
                        </p>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function abbreviate(label: string): string {
  const map: Record<string, string> = {
    'Pelvic pain': 'Pelvic',
    'Menstrual pain': 'Menst.',
    'Lower back pain': 'Back',
    'Pain during bowel movements': 'Bowel',
    'Pain during urination': 'Urin.',
    'Pain during sex': 'Sex',
    Fatigue: 'Fatig.',
    Bloating: 'Bloat',
  };
  return map[label] ?? label;
}

export { severityBand };
