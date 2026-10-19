'use client';

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ELEVATED_THRESHOLD, severityColor, severityBand, ratingColor } from '@/shared/symptoms';
import type { DomainSummary } from '@/lib/aggregate';

// Charts carry severity by position on the y-axis. The blue-to-red ramp only
// fills the points, so the reading survives greyscale printing and colour
// blindness — and the tooltip always states the number.

export interface SeriesPoint {
  date: string;
  severity: number | null;
}

const AXIS = { stroke: 'var(--muted)', fontSize: 11 };
const GRID = 'var(--border)';

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function SeverityChart({ data }: { data: SeriesPoint[] }) {
  const points = data.filter((d): d is { date: string; severity: number } => d.severity !== null);

  if (points.length === 0) {
    return <EmptyChart message="No symptom entries in this range." />;
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={AXIS}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine
            y={ELEVATED_THRESHOLD}
            stroke="var(--muted)"
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: `Elevated (${ELEVATED_THRESHOLD})`,
              position: 'insideTopRight',
              fill: 'var(--muted)',
              fontSize: 11,
            }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as { date: string; severity: number };
              return (
                <TooltipCard
                  title={shortDate(point.date)}
                  value={`${point.severity} / 100`}
                  detail={severityBand(point.severity)}
                  color={severityColor(point.severity)}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="severity"
            stroke="var(--muted)"
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={({ cx, cy, payload, index }) => (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={3}
                fill={severityColor((payload as { severity: number }).severity)}
                stroke="var(--card)"
                strokeWidth={1}
              />
            )}
            activeDot={{ r: 5, strokeWidth: 1, stroke: 'var(--card)' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One sparkline per domain, sharing a 0-10 axis so they can be compared. */
export function DomainSparkline({
  summary,
  data,
}: {
  summary: DomainSummary;
  data: Array<{ date: string; value: number | null }>;
}) {
  const points = data.filter((d): d is { date: string; value: number } => d.value !== null);

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium tracking-tight text-ink">{summary.label}</h3>
        <span className="font-mono text-sm tabular-nums text-ink">
          {summary.mean === null ? '—' : summary.mean.toFixed(1)}
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">
        {summary.answered === 0
          ? 'Not recorded'
          : `mean of ${summary.answered} ${summary.answered === 1 ? 'day' : 'days'}${
              summary.skipped > 0 ? ` · ${summary.skipped} n/a` : ''
            }`}
      </p>

      <div className="mt-3 h-16 w-full">
        {points.length === 0 ? (
          <div className="flex h-full items-center text-xs text-muted">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <YAxis domain={[0, 10]} hide />
              <XAxis dataKey="date" hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as { date: string; value: number };
                  return (
                    <TooltipCard
                      title={shortDate(point.date)}
                      value={`${point.value} / 10`}
                      color={ratingColor(point.value)}
                    />
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--muted)"
                strokeWidth={1.5}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Elevated episodes on a timeline, so runs are visible at a glance. */
export function EpisodeStrip({
  episodes,
  from,
  to,
}: {
  episodes: Array<{ started_on: string; ended_on: string; days: number }>;
  from: string;
  to: string;
}) {
  if (episodes.length === 0) return null;

  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const span = Math.max(1, end - start);

  return (
    <div>
      <div className="relative h-6 w-full overflow-hidden rounded-md border border-line bg-card">
        {episodes.map((episode) => {
          const s = new Date(`${episode.started_on}T00:00:00Z`).getTime();
          const e = new Date(`${episode.ended_on}T00:00:00Z`).getTime();
          const left = Math.max(0, ((s - start) / span) * 100);
          const width = Math.max(1.5, ((e - s) / span) * 100);
          return (
            <div
              key={episode.started_on}
              title={`${episode.days} elevated days from ${shortDate(episode.started_on)}`}
              className="absolute top-0 h-full"
              style={{
                left: `${left}%`,
                width: `${Math.min(width, 100 - left)}%`,
                backgroundColor: severityColor(75),
                opacity: 0.55,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{shortDate(from)}</span>
        <span>{shortDate(to)}</span>
      </div>
    </div>
  );
}

function TooltipCard({
  title,
  value,
  detail,
  color,
}: {
  title: string;
  value: string;
  detail?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-sm">
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-0.5 flex items-center gap-1.5 font-mono text-sm tabular-nums text-ink">
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted">
      {message}
    </div>
  );
}
