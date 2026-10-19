// Validates supabase/migrations/0001_init.sql against a real Postgres (PGlite,
// Postgres compiled to WASM). Supabase's `auth` schema is stubbed so the
// migration can run unmodified.
//
//   node tests/schema.test.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
let failures = 0;

function check(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}`);
  if (!pass) console.log(`         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function checkThat(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${cond ? '' : ` — ${detail}`}`);
}

// --- Stub Supabase's auth schema -------------------------------------------

await db.exec(`
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
`);

// --- Run the migration ------------------------------------------------------

const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
try {
  await db.exec(sql);
  console.log('  ok   migration applies cleanly\n');
} catch (e) {
  console.error(' FAIL  migration failed to apply:\n', e.message);
  process.exit(1);
}

const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id, email) values
    ('${USER}', 'a@example.com'), ('${OTHER}', 'b@example.com');
`);

check('signup trigger created a profile', (
  await db.query(`select count(*)::int as n from profiles where id = $1`, [USER])
).rows[0].n, 1);

// --- Severity scoring -------------------------------------------------------

console.log('\nseverity');

async function severityOf(fields) {
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  await db.query(`delete from symptom_logs where user_id = $1`, [USER]);
  const placeholders = cols.map((_, i) => `$${i + 3}`).join(', ');
  const res = await db.query(
    `insert into symptom_logs (user_id, log_date${cols.length ? ', ' + cols.join(', ') : ''})
     values ($1, $2${cols.length ? ', ' + placeholders : ''}) returning severity`,
    [USER, '2026-01-01', ...vals],
  );
  return res.rows[0].severity;
}

// All domains at 10 must saturate at 100; all at 0 must floor at 0.
const allTen = {
  pelvic_pain: 10, menstrual_pain: 10, fatigue: 10, bloating: 10,
  bowel_pain: 10, urination_pain: 10, lower_back_pain: 10, sex_pain: 10,
};
const allZero = Object.fromEntries(Object.keys(allTen).map((k) => [k, 0]));

check('all domains 10 -> 100', await severityOf(allTen), 100);
check('all domains 0 -> 0', await severityOf(allZero), 0);
check('all domains 5 -> 50', await severityOf(
  Object.fromEntries(Object.keys(allTen).map((k) => [k, 5])),
), 50);

// The central claim: a skipped domain is excluded from the average entirely,
// so it scores identically to a log where that domain was never offered — and
// strictly higher than one where the patient answered 0.
const withoutSexPain = { ...allTen };
delete withoutSexPain.sex_pain;

const nullSex = await severityOf(withoutSexPain);
const zeroSex = await severityOf({ ...withoutSexPain, sex_pain: 0 });
const tenSex = await severityOf(allTen);

check('null sex_pain is excluded, not counted as 0', nullSex, 100);
checkThat('null sex_pain scores higher than sex_pain = 0', nullSex > zeroSex,
  `null=${nullSex} zero=${zeroSex}`);
checkThat('sex_pain = 0 drags the score down as expected', zeroSex < tenSex,
  `zero=${zeroSex} ten=${tenSex}`);

// Hand-computed spot check: pelvic 8, menstrual 6, fatigue 4, rest skipped.
//   numerator   = 8*3.0 + 6*2.5 + 4*1.5 = 24 + 15 + 6 = 45
//   denominator = (3.0 + 2.5 + 1.5) * 10 = 70
//   severity    = round(45 / 70 * 100) = round(64.28...) = 64
check('partial log matches hand computation (64)', await severityOf({
  pelvic_pain: 8, menstrual_pain: 6, fatigue: 4,
}), 64);

// A log with every domain skipped has no defensible score at all.
check('fully skipped log has null severity', await severityOf({}), null);

// --- Constraints ------------------------------------------------------------

console.log('\nconstraints');

let rejected = false;
try {
  await db.query(
    `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-02-01', 11)`,
    [USER],
  );
} catch { rejected = true; }
checkThat('rejects a rating above 10', rejected);

rejected = false;
try {
  await db.query(
    `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-02-01', -1)`,
    [USER],
  );
} catch { rejected = true; }
checkThat('rejects a negative rating', rejected);

await db.query(`delete from symptom_logs where user_id = $1`, [USER]);
await db.query(
  `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-03-01', 5)`, [USER]);
rejected = false;
try {
  await db.query(
    `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-03-01', 7)`, [USER]);
} catch { rejected = true; }
checkThat('one log per day per user', rejected);

// Upsert is the intended path for re-logging the same day.
await db.query(
  `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-03-01', 7)
   on conflict (user_id, log_date) do update set pelvic_pain = excluded.pelvic_pain`, [USER]);
check('upsert replaces the same-day log', (
  await db.query(`select pelvic_pain from symptom_logs where user_id = $1 and log_date = '2026-03-01'`, [USER])
).rows[0].pelvic_pain, 7);

// --- Elevated streak --------------------------------------------------------

console.log('\nelevated streak');

// severity >= 60 needs pelvic_pain alone at >= 6 when it is the only domain.
async function seedDays(dates, { elevated = true } = {}) {
  await db.query(`delete from symptom_logs where user_id = $1`, [USER]);
  for (const d of dates) {
    await db.query(
      `insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, $2, $3)`,
      [USER, d, elevated ? 9 : 2],
    );
  }
}

function daysBack(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Seven consecutive elevated days ending today.
await seedDays([6, 5, 4, 3, 2, 1, 0].map(daysBack));
let streak = (await db.query(`select * from v_elevated_streak where user_id = $1`, [USER])).rows;
check('7 consecutive elevated days -> streak of 7', streak[0]?.current_streak_days, 7);

// The same seven days with the middle one missing must NOT trigger. A gap in
// logging is not evidence of an elevated day.
await seedDays([6, 5, 4, 2, 1, 0].map(daysBack));
streak = (await db.query(`select * from v_elevated_streak where user_id = $1`, [USER])).rows;
checkThat('a gap breaks the streak', (streak[0]?.current_streak_days ?? 0) < 7,
  `got ${streak[0]?.current_streak_days}`);

// A run of seven where one day is below threshold must not trigger either.
await seedDays([6, 5, 4, 3, 2, 1, 0].map(daysBack));
await db.query(
  `update symptom_logs set pelvic_pain = 1 where user_id = $1 and log_date = $2`,
  [USER, daysBack(3)]);
streak = (await db.query(`select * from v_elevated_streak where user_id = $1`, [USER])).rows;
checkThat('a below-threshold day breaks the streak', (streak[0]?.current_streak_days ?? 0) < 7,
  `got ${streak[0]?.current_streak_days}`);

// A run that ended a week ago is history, not a current streak.
await seedDays([16, 15, 14, 13, 12, 11, 10].map(daysBack));
streak = (await db.query(`select * from v_elevated_streak where user_id = $1`, [USER])).rows;
check('an old run is not a current streak', streak.length, 0);
check('...but is still listed as an episode', (
  await db.query(`select count(*)::int as n from v_elevated_episodes where user_id = $1`, [USER])
).rows[0].n, 1);

// Yesterday-ending runs stay live, so the banner does not vanish each morning
// before the patient has logged.
await seedDays([7, 6, 5, 4, 3, 2, 1].map(daysBack));
streak = (await db.query(`select * from v_elevated_streak where user_id = $1`, [USER])).rows;
check('a run ending yesterday is still current', streak[0]?.current_streak_days, 7);

// --- Count metrics ----------------------------------------------------------

console.log('\ncount metrics');

await db.query(`delete from symptom_logs where user_id = $1`, [USER]);
for (let i = 0; i < 10; i++) {
  await db.query(
    `insert into symptom_logs (user_id, log_date, pelvic_pain, missed_work, took_pain_medication)
     values ($1, $2, 5, $3, $4)`,
    [USER, daysBack(i), i < 3, i < 6],
  );
}
const counts = (await db.query(
  `select count(*) filter (where missed_work)::int as days_missed,
          count(*) filter (where took_pain_medication)::int as medication_days
   from symptom_logs where user_id = $1`, [USER])).rows[0];
check('days missed work/school sums correctly', counts.days_missed, 3);
check('pain medication days sums correctly', counts.medication_days, 6);

// --- RLS --------------------------------------------------------------------

console.log('\nrow level security');

const rlsOff = (await db.query(`
  select tablename from pg_tables
  where schemaname = 'public' and rowsecurity = false
`)).rows.map((r) => r.tablename);
check('every public table has RLS enabled', rlsOff, []);

const invoker = (await db.query(`
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce((select option_value from pg_options_to_table(c.reloptions)
                      where option_name = 'security_invoker')::boolean, false)
`)).rows.map((r) => r.relname);
check('every view is security_invoker', invoker, []);

// A signed-in patient must see only their own rows.
await db.query(`insert into symptom_logs (user_id, log_date, pelvic_pain) values ($1, '2026-06-01', 9)`, [OTHER]);
await db.exec(`
  create role authenticated;
  grant usage on schema public to authenticated;
  grant all on all tables in schema public to authenticated;
`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${USER}', false);`);
const visible = (await db.query(`select count(*)::int as n from symptom_logs where log_date = '2026-06-01'`)).rows[0].n;
await db.exec(`reset role;`);
check("a patient cannot read another patient's logs", visible, 0);

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
