import 'server-only';

import type { Aggregate } from './aggregate';
import { ELEVATED_THRESHOLD } from '@/shared/symptoms';

// The consultation report.
//
// The model is given pre-computed statistics, never the raw daily rows. That
// keeps the prompt a fixed size regardless of how long the patient has been
// logging, and — more importantly — means every figure in the report was
// calculated in aggregate.ts and can be checked against the database. A model
// asked to average 300 numbers will produce something plausible and wrong.
//
// Output is a fixed JSON structure rather than prose, so the page renders real
// components and a malformed response fails loudly instead of rendering as a
// wall of markdown.
//
// Generation goes through OpenRouter's OpenAI-compatible chat completions
// endpoint rather than a provider SDK, so the underlying model is just an env
// var (OPENROUTER_MODEL) — swap it without touching this file. The tradeoff:
// OpenRouter's `json_object` mode is honoured by most models but is not
// server-enforced the way Gemini's responseSchema was, so the response is
// validated at runtime below rather than trusted blindly.

export interface ConsultationReport {
  presenting_complaint: string;
  symptom_summary: Array<{ domain: string; finding: string }>;
  temporal_patterns: string;
  functional_impact: string;
  medication_use: string;
  journal_themes: Array<{ theme: string; evidence: string }>;
  features_for_assessment: string[];
  suggested_questions: string[];
  data_limitations: string;
}

// Sent to the model as the shape it must return, since there is no
// programmatic schema enforcement to fall back on.
const OUTPUT_SHAPE = `{
  "presenting_complaint": string,        // two or three sentences: what the patient has been recording and over what period
  "symptom_summary": [                   // one entry per recorded symptom domain, ordered most to least severe
    { "domain": string, "finding": string }  // finding: one sentence quoting the supplied mean, median and maximum
  ],
  "temporal_patterns": string,           // direction of travel and any elevated episodes, quoting dates and durations
  "functional_impact": string,           // days missed from work or school, as a count and a proportion of logged days
  "medication_use": string,              // frequency of pain medication use and what was taken, where recorded
  "journal_themes": [                    // recurring themes in the free-text notes; [] if the notes are too sparse
    { "theme": string, "evidence": string }  // evidence: how many entries mention it, and a brief paraphrase — never a long quote
  ],
  "features_for_assessment": string[],   // observations that may warrant clinician attention; descriptive only, never a diagnosis or treatment recommendation
  "suggested_questions": string[],       // questions the clinician might ask to fill gaps the data cannot answer
  "data_limitations": string             // what this data cannot show: logging gaps, skipped domains, absent cycle tracking, self-report
}`;

const SYSTEM_INSTRUCTION = `You are preparing a factual summary of patient-recorded symptom data for a clinician to read before a consultation.

Your role is strictly to summarise the statistics you are given.

Rules, in order of importance:
1. Never diagnose. Never state or imply that the data indicates endometriosis or any other condition. Never suggest, recommend, or comment on treatment, medication changes, or investigations.
2. Use only the figures supplied. Do not calculate new statistics, do not estimate, and do not infer values for days or domains that are absent. If you state a number, it must appear verbatim in the input.
3. Where a domain is marked as skipped or not applicable, say so explicitly. Never treat an unanswered domain as a score of zero or as an absence of symptoms.
4. If the data is too sparse to support a statement, say that plainly instead of hedging into a claim.
5. Write in plain clinical English, in the third person, without adjectives that editorialise ("severe suffering", "alarming"). Describe what was recorded.
6. This is self-reported data. Frame findings as what the patient recorded, not as objective fact.
7. Read the free-text notes as evidence in their own right, not decoration. Draw out recurring themes — triggers, what helped, effects on work, sleep and relationships, and the emotional weight the patient describes. Psychosocial signals such as persistent low mood, hopelessness or exhaustion matter as much as the physical ratings and must be surfaced when the notes contain them, not filtered out as unclinical. Name a theme only when more than one entry supports it, and say how many did.

A composite severity score of ${ELEVATED_THRESHOLD} or above out of 100 is defined as "elevated" by the recording app. That is a threshold set by the application, not a clinical standard, and you should describe it as such if you mention it.

Respond with a single JSON object and nothing else — no markdown fences, no commentary before or after. It must match exactly this shape (comments are for your reference only, do not include them in the output):

${OUTPUT_SHAPE}`;

function buildPrompt(stats: Aggregate, displayName: string | null): string {
  const domains = stats.domains
    .filter((d) => d.answered > 0)
    .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
    .map((d) =>
      [
        `- ${d.label}: mean ${d.mean}, median ${d.median}, max ${d.max} (0-10 scale)`,
        `answered on ${d.answered} of ${stats.daysLogged} logged days`,
        d.skipped > 0 ? `skipped or not applicable on ${d.skipped}` : null,
        d.trend !== null
          ? `recent third of the period averages ${d.recentMean} (${
              d.trend > 0 ? `+${d.trend} higher` : d.trend < 0 ? `${d.trend} lower` : 'unchanged'
            } than earlier)`
          : 'too few entries to describe a trend',
      ]
        .filter(Boolean)
        .join('; '),
    )
    .join('\n');

  const unanswered = stats.domains.filter((d) => d.answered === 0);

  const episodes = stats.episodes.length
    ? stats.episodes
        .map((e) => `- ${e.days} consecutive elevated days, ${e.started_on} to ${e.ended_on}`)
        .join('\n')
    : '- none';

  // The notes are the unstructured half of the record and the part the model is
  // actually needed for, so they get a generous budget — capped only to keep the
  // prompt bounded for a patient who has been logging for a year.
  const notes = stats.notes.length
    ? stats.notes
        .slice(-40)
        .map((n) => `- ${n.date}: ${n.text.replace(/\s+/g, ' ').slice(0, 400)}`)
        .join('\n')
    : '- none recorded';

  return `PATIENT: ${displayName ?? 'Not named'}
PERIOD: ${stats.from} to ${stats.to} (${stats.daysInRange} days)
LOGGING: ${stats.daysLogged} days logged, ${stats.adherence}% of the period

COMPOSITE SEVERITY (0-100, weighted across all recorded symptoms)
- mean ${stats.severityMean ?? 'no data'}
- maximum ${stats.severityMax ?? 'no data'}${
    stats.worstDay ? ` on ${stats.worstDay.date}` : ''
  }
- ${stats.elevatedDays} of ${stats.daysLogged} logged days at or above the elevated threshold of ${ELEVATED_THRESHOLD}

SYMPTOM DOMAINS
${domains || '- no domains recorded'}
${
  unanswered.length
    ? `\nNOT RECORDED AT ALL IN THIS PERIOD: ${unanswered.map((d) => d.label).join(', ')}`
    : ''
}

ELEVATED EPISODES (runs of consecutive days at or above threshold, across the full history)
${episodes}
Longest run: ${stats.longestEpisode} days

FUNCTIONAL IMPACT
- missed work or school on ${stats.daysMissedWork} of ${stats.daysLogged} logged days

MEDICATION
- pain medication taken on ${stats.medicationDays} of ${stats.daysLogged} logged days
${
  stats.medicationsTaken.length
    ? stats.medicationsTaken.map((m) => `- ${m.name}: ${m.days} days`).join('\n')
    : '- no specific medications named'
}

PATIENT NOTES (free text, most recent first-hand entries)
${notes}

KNOWN GAPS IN THIS DATASET
- The app does not record menstrual cycle dates or bleeding, so cyclical versus constant patterning cannot be determined from this data.
- ${stats.daysInRange - stats.daysLogged} days in the period have no entry.
- All values are self-reported.

Produce the structured consultation summary as JSON.`;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function generateReport(
  stats: Aggregate,
  displayName: string | null,
): Promise<ConsultationReport> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set. See .env.example.');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // OpenRouter attributes usage to a referrer/title on its dashboard.
      // Harmless to omit correctness-wise; included for their leaderboard.
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
      'X-Title': 'Symptom Diary',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
      // Near-deterministic: two clinicians opening the same record should not
      // see materially different summaries of the same numbers.
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: buildPrompt(stats, displayName) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const text: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error('The model returned an empty response.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error('The model returned a response that could not be read.');
  }

  return validateReport(parsed);
}

/** Some models wrap JSON output in a markdown fence despite instructions not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

/**
 * Confirms the model's JSON actually has the shape the report page renders.
 *
 * Gemini's responseSchema used to guarantee this server-side. Without that
 * guarantee, a model that drifts from the requested shape would otherwise
 * crash report-view.tsx on a missing field or a string where an array was
 * expected — this turns that into one clear error instead.
 */
function validateReport(data: unknown): ConsultationReport {
  if (typeof data !== 'object' || data === null) {
    throw new Error("The model's response was not a JSON object.");
  }
  const d = data as Record<string, unknown>;

  const isString = (v: unknown): v is string => typeof v === 'string';
  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
  const isPairArray = (v: unknown, keyA: string, keyB: string): boolean =>
    Array.isArray(v) &&
    v.every(
      (x) =>
        x !== null &&
        typeof x === 'object' &&
        isString((x as Record<string, unknown>)[keyA]) &&
        isString((x as Record<string, unknown>)[keyB]),
    );

  const checks: Array<[keyof ConsultationReport, boolean]> = [
    ['presenting_complaint', isString(d.presenting_complaint)],
    ['symptom_summary', isPairArray(d.symptom_summary, 'domain', 'finding')],
    ['temporal_patterns', isString(d.temporal_patterns)],
    ['functional_impact', isString(d.functional_impact)],
    ['medication_use', isString(d.medication_use)],
    ['journal_themes', isPairArray(d.journal_themes, 'theme', 'evidence')],
    ['features_for_assessment', isStringArray(d.features_for_assessment)],
    ['suggested_questions', isStringArray(d.suggested_questions)],
    ['data_limitations', isString(d.data_limitations)],
  ];

  const bad = checks.find(([, ok]) => !ok);
  if (bad) {
    throw new Error(`The model's response was missing or malformed field: ${bad[0]}`);
  }

  return d as unknown as ConsultationReport;
}
