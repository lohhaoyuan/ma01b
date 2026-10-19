'use client';

import { useState } from 'react';
import { Bot, Copy, Check, Loader2, Printer, RefreshCw, Sparkles } from 'lucide-react';
import type { ConsultationReport } from '@/lib/report';
import type { RangeKey } from '@/shared/types';

export function ReportView({
  range,
  hasConsent,
  daysLogged,
  patientName,
  periodLabel,
}: {
  range: RangeKey;
  hasConsent: boolean;
  daysLogged: number;
  patientName: string;
  periodLabel: string;
}) {
  const [report, setReport] = useState<ConsultationReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? 'Could not generate the report.');
        return;
      }
      setReport(body.report);
      setGeneratedAt(body.generatedAt);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!report) return;
    await navigator.clipboard.writeText(asPlainText(report, patientName, periodLabel));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hasConsent) {
    return (
      <Notice title="AI report generation is turned off for this patient">
        Generating this summary would send their symptom data to a third-party AI model. The
        patient has not agreed to that. They can enable it in the app under Settings, or you can
        read the full record directly.
      </Notice>
    );
  }

  if (daysLogged === 0) {
    return (
      <Notice title="No entries in this period">
        There is nothing to summarise. Try a longer range from the record view.
      </Notice>
    );
  }

  return (
    <div className="mt-6">
      {/* Non-dismissible, and printed along with the report — a clinician
          reading a printout must still see that a model wrote it. */}
      <div className="flex gap-3 rounded-lg border border-line bg-card p-4">
        <Bot size={17} strokeWidth={1.5} className="mt-px shrink-0 text-muted" />
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-medium text-ink">AI-generated decision support.</span> This summary
          is produced by a language model from the patient&apos;s self-reported entries. It is not a
          diagnosis and has not been reviewed by a clinician. Verify every figure against the record
          before relying on it.
        </p>
      </div>

      {!report && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed border-line p-10 text-center">
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Summarises {daysLogged} logged {daysLogged === 1 ? 'day' : 'days'} into a structured
            pre-consultation brief.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-contrast transition-colors duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Sparkles size={15} strokeWidth={1.5} />
                Generate summary
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-line bg-card p-4 text-sm text-ink">
          {error}
        </p>
      )}

      {report && (
        <>
          <div className="no-print mt-6 flex flex-wrap items-center gap-2">
            <ActionButton onClick={generate} disabled={loading} icon={loading ? Loader2 : RefreshCw} spinning={loading}>
              Regenerate
            </ActionButton>
            <ActionButton onClick={copy} icon={copied ? Check : Copy}>
              {copied ? 'Copied' : 'Copy'}
            </ActionButton>
            <ActionButton onClick={() => window.print()} icon={Printer}>
              Print
            </ActionButton>
            {generatedAt && (
              <span className="ml-auto text-xs text-muted">
                Generated {new Date(generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <article className="mt-6 flex flex-col gap-6">
            <Section title="Presenting complaint">
              <p className="text-sm leading-relaxed text-ink">{report.presenting_complaint}</p>
            </Section>

            <Section title="Symptom summary">
              <dl className="flex flex-col gap-3">
                {report.symptom_summary.map((item) => (
                  <div key={item.domain}>
                    <dt className="text-sm font-medium tracking-tight text-ink">{item.domain}</dt>
                    <dd className="mt-0.5 text-sm leading-relaxed text-muted">{item.finding}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title="Temporal patterns">
              <p className="text-sm leading-relaxed text-ink">{report.temporal_patterns}</p>
            </Section>

            <Section title="Functional impact">
              <p className="text-sm leading-relaxed text-ink">{report.functional_impact}</p>
            </Section>

            <Section title="Medication use">
              <p className="text-sm leading-relaxed text-ink">{report.medication_use}</p>
            </Section>

            <Section title="Themes in the patient's own words">
              {report.journal_themes.length === 0 ? (
                <p className="text-sm text-muted">
                  The written notes were too sparse to draw recurring themes from.
                </p>
              ) : (
                <dl className="flex flex-col gap-3">
                  {report.journal_themes.map((item) => (
                    <div key={item.theme}>
                      <dt className="text-sm font-medium tracking-tight text-ink">{item.theme}</dt>
                      <dd className="mt-0.5 text-sm leading-relaxed text-muted">{item.evidence}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            <Section title="Features that may warrant assessment">
              <List items={report.features_for_assessment} />
            </Section>

            <Section title="Suggested questions for the consultation">
              <List items={report.suggested_questions} />
            </Section>

            <Section title="What this data cannot show">
              <p className="text-sm leading-relaxed text-muted">{report.data_limitations}</p>
            </Section>
          </article>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-5 print-plain">
      <h2 className="mb-2.5 text-sm font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">None identified from the recorded data.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  spinning,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  spinning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink transition-colors duration-150 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50 dark:hover:bg-zinc-800/60"
    >
      <Icon size={15} strokeWidth={1.5} className={spinning ? 'animate-spin' : undefined} />
      {children}
    </button>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-card p-6">
      <h2 className="text-sm font-medium tracking-tight text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function asPlainText(report: ConsultationReport, patientName: string, period: string): string {
  return [
    `CONSULTATION SUMMARY — ${patientName}`,
    period,
    'AI-generated from patient self-reported data. Not a diagnosis. Verify against the record.',
    '',
    'PRESENTING COMPLAINT',
    report.presenting_complaint,
    '',
    'SYMPTOM SUMMARY',
    ...report.symptom_summary.map((s) => `${s.domain}: ${s.finding}`),
    '',
    'TEMPORAL PATTERNS',
    report.temporal_patterns,
    '',
    'FUNCTIONAL IMPACT',
    report.functional_impact,
    '',
    'MEDICATION USE',
    report.medication_use,
    '',
    "THEMES IN THE PATIENT'S OWN WORDS",
    ...(report.journal_themes.length
      ? report.journal_themes.map((t) => `${t.theme}: ${t.evidence}`)
      : ['Notes too sparse to draw themes from.']),
    '',
    'FEATURES THAT MAY WARRANT ASSESSMENT',
    ...report.features_for_assessment.map((f) => `- ${f}`),
    '',
    'SUGGESTED QUESTIONS',
    ...report.suggested_questions.map((q) => `- ${q}`),
    '',
    'WHAT THIS DATA CANNOT SHOW',
    report.data_limitations,
  ].join('\n');
}
