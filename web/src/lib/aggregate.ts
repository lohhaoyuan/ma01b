import { DOMAINS, ELEVATED_THRESHOLD, type DomainKey } from '@/shared/symptoms';
import type { SymptomLog, ElevatedEpisode, Medication } from '@/shared/types';

// Everything the dashboard and the report both need, computed once, here.
//
// The report route passes these figures to the model rather than the raw rows.
// Two reasons: the token cost stays flat as a patient's history grows, and the
// model is never asked to do arithmetic — every number in the generated report
// is one that was computed in this file and can be checked against the database.

export interface DomainSummary {
  key: DomainKey;
  label: string;
  /** Days the patient actually answered this domain. */
  answered: number;
  /** Days marked not applicable or skipped. */
  skipped: number;
  mean: number | null;
  median: number | null;
  max: number | null;
  /** Mean over the most recent third of the range, for a direction of travel. */
  recentMean: number | null;
  /** Positive means worsening. Null when there is too little data to say. */
  trend: number | null;
}

export interface Aggregate {
  from: string;
  to: string;
  daysInRange: number;
  daysLogged: number;
  adherence: number;

  severityMean: number | null;
  severityMax: number | null;
  worstDay: { date: string; severity: number } | null;
  elevatedDays: number;

  domains: DomainSummary[];
  worstDomain: DomainSummary | null;

  daysMissedWork: number;
  medicationDays: number;
  medicationsTaken: Array<{ name: string; days: number }>;

  episodes: ElevatedEpisode[];
  longestEpisode: number;

  notes: Array<{ date: string; text: string }>;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function aggregate(
  logs: SymptomLog[],
  medications: Medication[],
  episodes: ElevatedEpisode[],
  from: string,
  to: string,
): Aggregate {
  const ordered = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const daysInRange = Math.max(1, daysBetween(from, to));

  const severities = ordered
    .map((l) => l.severity)
    .filter((s): s is number => s !== null);

  const worst = ordered.reduce<{ date: string; severity: number } | null>((acc, log) => {
    if (log.severity === null) return acc;
    if (!acc || log.severity > acc.severity) return { date: log.log_date, severity: log.severity };
    return acc;
  }, null);

  // The most recent third of the logged days, used only to say which way things
  // are moving. Below six logs the split is too small to mean anything, so the
  // trend is reported as unknown rather than as a number nobody should trust.
  const recentCount = Math.floor(ordered.length / 3);
  const canTrend = ordered.length >= 6 && recentCount >= 2;
  const earlier = ordered.slice(0, ordered.length - recentCount);
  const recent = ordered.slice(ordered.length - recentCount);

  const domains: DomainSummary[] = DOMAINS.map((domain) => {
    const answered = ordered
      .map((l) => l[domain.key])
      .filter((v): v is number => v !== null && v !== undefined);

    const recentValues = recent
      .map((l) => l[domain.key])
      .filter((v): v is number => v !== null && v !== undefined);
    const earlierValues = earlier
      .map((l) => l[domain.key])
      .filter((v): v is number => v !== null && v !== undefined);

    const recentMean = canTrend ? mean(recentValues) : null;
    const earlierMean = canTrend ? mean(earlierValues) : null;

    return {
      key: domain.key,
      label: domain.label,
      answered: answered.length,
      skipped: ordered.length - answered.length,
      mean: mean(answered),
      median: median(answered),
      max: answered.length ? Math.max(...answered) : null,
      recentMean,
      trend:
        recentMean !== null && earlierMean !== null ? round1(recentMean - earlierMean) : null,
    };
  });

  const rated = domains.filter((d) => d.mean !== null);
  const worstDomain = rated.length
    ? rated.reduce((a, b) => ((b.mean ?? 0) > (a.mean ?? 0) ? b : a))
    : null;

  const medsByName = new Map<string, Set<string>>();
  const logDateById = new Map(ordered.map((l) => [l.id, l.log_date]));
  for (const med of medications) {
    const date = logDateById.get(med.log_id);
    if (!date) continue;
    const key = med.name.trim().toLowerCase();
    if (!medsByName.has(key)) medsByName.set(key, new Set());
    medsByName.get(key)!.add(date);
  }

  return {
    from,
    to,
    daysInRange,
    daysLogged: ordered.length,
    adherence: Math.round((ordered.length / daysInRange) * 100),

    severityMean: mean(severities),
    severityMax: severities.length ? Math.max(...severities) : null,
    worstDay: worst,
    elevatedDays: severities.filter((s) => s >= ELEVATED_THRESHOLD).length,

    domains,
    worstDomain,

    daysMissedWork: ordered.filter((l) => l.missed_work).length,
    medicationDays: ordered.filter((l) => l.took_pain_medication).length,
    medicationsTaken: [...medsByName.entries()]
      .map(([name, dates]) => ({ name, days: dates.size }))
      .sort((a, b) => b.days - a.days),

    episodes,
    longestEpisode: episodes.reduce((max, e) => Math.max(max, e.days), 0),

    notes: ordered
      .filter((l) => l.notes && l.notes.trim().length > 0)
      .map((l) => ({ date: l.log_date, text: l.notes!.trim() })),
  };
}

/** ISO date `n` days before today, in UTC. */
export function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
