// Standalone smoke test for the OpenRouter report integration.
//
// Calls generateReport() directly with synthetic Aggregate data — no Supabase
// session, no browser, no simulator needed. Verifies the actual network call,
// prompt, and runtime shape validation all work before testing through the UI.
//
// Runs under tsx rather than plain node because report.ts is imported via the
// tsconfig `@/` path alias, which only bundlers (Next, tsx) resolve — plain
// Node's ESM loader does not.
//
// Also needs the `react-server` export condition set (via NODE_OPTIONS in the
// npm script below), because the `server-only` package resolves to a
// throwing stub unless that condition is present — Next sets it internally
// when bundling server code; nothing outside Next does by default.
//
//   cd web && npm run test:report

import { generateReport } from '../src/lib/report.ts';

/** @type {import('../src/lib/aggregate').Aggregate} */
const stats = {
  from: '2026-07-01',
  to: '2026-07-31',
  daysInRange: 31,
  daysLogged: 28,
  adherence: 90,

  severityMean: 58.4,
  severityMax: 92,
  worstDay: { date: '2026-07-19', severity: 92 },
  elevatedDays: 11,

  domains: [
    { key: 'pelvic_pain', label: 'Pelvic pain', answered: 28, skipped: 0, mean: 6.8, median: 7, max: 10, recentMean: 7.9, trend: 1.6 },
    { key: 'menstrual_pain', label: 'Menstrual pain', answered: 28, skipped: 0, mean: 7.2, median: 8, max: 9, recentMean: 7.5, trend: 0.4 },
    { key: 'lower_back_pain', label: 'Lower back pain', answered: 28, skipped: 0, mean: 5.1, median: 5, max: 8, recentMean: 5.9, trend: 1.1 },
    { key: 'bowel_pain', label: 'Pain during bowel movements', answered: 20, skipped: 8, mean: 4.3, median: 4, max: 7, recentMean: 4.8, trend: 0.9 },
    { key: 'urination_pain', label: 'Pain during urination', answered: 28, skipped: 0, mean: 2.1, median: 2, max: 5, recentMean: null, trend: null },
    { key: 'sex_pain', label: 'Pain during sex', answered: 6, skipped: 22, mean: 7.5, median: 8, max: 9, recentMean: null, trend: null },
    { key: 'fatigue', label: 'Fatigue', answered: 28, skipped: 0, mean: 6.4, median: 6, max: 9, recentMean: 7.1, trend: 0.9 },
    { key: 'bloating', label: 'Bloating', answered: 28, skipped: 0, mean: 5.9, median: 6, max: 9, recentMean: 6.2, trend: 0.5 },
  ],
  worstDomain: { key: 'menstrual_pain', label: 'Menstrual pain', answered: 28, skipped: 0, mean: 7.2, median: 8, max: 9, recentMean: 7.5, trend: 0.4 },

  daysMissedWork: 5,
  medicationDays: 19,
  medicationsTaken: [
    { name: 'Ibuprofen', days: 14 },
    { name: 'Naproxen', days: 5 },
  ],

  episodes: [
    { user_id: 'test', started_on: '2026-07-15', ended_on: '2026-07-21', days: 7 },
    { user_id: 'test', started_on: '2026-07-27', ended_on: '2026-07-31', days: 5 },
  ],
  longestEpisode: 7,

  notes: [
    { date: '2026-07-15', text: 'Pain started suddenly this morning, had to leave work early. Heat pack helped a bit.' },
    { date: '2026-07-16', text: 'Still bad. Barely slept. Feeling really discouraged, like nobody believes how much this hurts.' },
    { date: '2026-07-19', text: 'Worst day yet. Could not get out of bed. Missed my sister’s birthday lunch.' },
    { date: '2026-07-21', text: 'A bit better today. Took the day off anyway to rest. Ibuprofen actually worked this time.' },
    { date: '2026-07-27', text: 'Flare starting again, right on schedule with my cycle. Same exhausted, hopeless feeling as last time.' },
  ],
};

console.log('Calling OpenRouter via generateReport()...\n');
const started = Date.now();

try {
  const report = await generateReport(stats, 'Test Patient');
  console.log(`ok — responded in ${Date.now() - started}ms\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
}
