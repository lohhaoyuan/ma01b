-- Endometriosis symptom management — core schema.
--
-- This file is the single source of truth for the data model. Severity scoring
-- lives here as a generated column so the mobile app and the clinician web app
-- can never disagree about whether a day was "elevated".

-- gen_random_uuid() is core Postgres since 13, so no pgcrypto extension needed.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id                   uuid primary key references auth.users on delete cascade,
  display_name         text,
  reminder_time        time not null default '20:00',
  reminder_enabled     boolean not null default true,
  ai_report_consent_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column profiles.ai_report_consent_at is
  'Set when the patient explicitly consents to their data being sent to the Gemini API. '
  'Report generation is refused while this is null.';

-- ---------------------------------------------------------------------------
-- symptom_logs
-- ---------------------------------------------------------------------------
--
-- Every rated domain is nullable. Null means "not answered / not applicable",
-- which is a different fact from 0 ("it applied and did not hurt"). The
-- severity expression below excludes null domains from both the numerator and
-- the denominator, so skipping a question neither inflates nor deflates the
-- score. Storing a skip as 0 would silently understate a patient's pain.

create table symptom_logs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users on delete cascade,
  log_date             date not null,

  -- Eight rated domains, 0-10 NRS.
  pelvic_pain          smallint check (pelvic_pain      between 0 and 10),
  menstrual_pain       smallint check (menstrual_pain   between 0 and 10),
  fatigue              smallint check (fatigue          between 0 and 10),
  bloating             smallint check (bloating         between 0 and 10),
  bowel_pain           smallint check (bowel_pain       between 0 and 10),
  urination_pain       smallint check (urination_pain   between 0 and 10),
  lower_back_pain      smallint check (lower_back_pain  between 0 and 10),
  sex_pain             smallint check (sex_pain         between 0 and 10),

  -- Daily booleans. "Days missed work/school" and "pain medication days" are
  -- period totals and cannot be answered on a single day, so they are captured
  -- daily and summed over the selected range by the reporting views.
  missed_work          boolean not null default false,
  took_pain_medication boolean not null default false,

  notes                text,

  -- Weighted mean across the domains that were actually answered, scaled 0-100.
  -- Weights: pelvic 3.0, menstrual 2.5, fatigue/bowel/urination/back/sex 1.5,
  -- bloating 1.0 (sums to 14.0 when every domain is answered).
  severity smallint generated always as (
    round(
      (
          coalesce(pelvic_pain,     0) * 3.0
        + coalesce(menstrual_pain,  0) * 2.5
        + coalesce(fatigue,         0) * 1.5
        + coalesce(bloating,        0) * 1.0
        + coalesce(bowel_pain,      0) * 1.5
        + coalesce(urination_pain,  0) * 1.5
        + coalesce(lower_back_pain, 0) * 1.5
        + coalesce(sex_pain,        0) * 1.5
      )
      / nullif(
          (
              (case when pelvic_pain     is null then 0 else 3.0 end)
            + (case when menstrual_pain  is null then 0 else 2.5 end)
            + (case when fatigue         is null then 0 else 1.5 end)
            + (case when bloating        is null then 0 else 1.0 end)
            + (case when bowel_pain      is null then 0 else 1.5 end)
            + (case when urination_pain  is null then 0 else 1.5 end)
            + (case when lower_back_pain is null then 0 else 1.5 end)
            + (case when sex_pain        is null then 0 else 1.5 end)
          ) * 10.0,
          0
        )
      * 100
    )
  ) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, log_date)
);

create index symptom_logs_user_date_idx on symptom_logs (user_id, log_date desc);

-- The elevated threshold. Referenced by the streak view and surfaced to both
-- clients so the charts draw their reference line at the same value.
create or replace function elevated_threshold() returns smallint
  language sql immutable parallel safe
  as $$ select 60::smallint $$;

-- ---------------------------------------------------------------------------
-- medications — optional detail behind took_pain_medication
-- ---------------------------------------------------------------------------

create table medications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  log_id     uuid not null references symptom_logs on delete cascade,
  name       text not null,
  dose       text,
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index medications_log_idx on medications (log_id);

-- ---------------------------------------------------------------------------
-- totp_secrets — the rotating access code shared with a clinician
-- ---------------------------------------------------------------------------

create table totp_secrets (
  user_id    uuid primary key references auth.users on delete cascade,
  secret     bytea not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- access_grants — audit trail the patient can inspect
-- ---------------------------------------------------------------------------

create table access_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip_hash    text
);

create index access_grants_user_idx on access_grants (user_id, granted_at desc);

-- ---------------------------------------------------------------------------
-- code_attempts — rate limiting for code redemption, keyed by hashed IP
-- ---------------------------------------------------------------------------

create table code_attempts (
  id          bigserial primary key,
  ip_hash     text not null,
  attempted_at timestamptz not null default now(),
  succeeded   boolean not null default false
);

create index code_attempts_ip_time_idx on code_attempts (ip_hash, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- security_invoker makes these respect the querying user's RLS rather than the
-- view owner's. Without it a view would leak every patient's data.

-- Contiguous runs of elevated days. Gaps-and-islands: subtracting a dense row
-- number from the date gives a constant per run of consecutive calendar days,
-- so a missing day correctly breaks the run rather than being skipped over.
create view v_elevated_episodes with (security_invoker = true) as
with elevated as (
  select
    user_id,
    log_date,
    log_date - (row_number() over (partition by user_id order by log_date))::int as grp
  from symptom_logs
  where severity >= elevated_threshold()
)
select
  user_id,
  min(log_date) as started_on,
  max(log_date) as ended_on,
  count(*)::int as days
from elevated
group by user_id, grp;

-- The current run, if it is still live. "Live" allows the run to end yesterday,
-- since today may simply not be logged yet; requiring it to include today would
-- make the banner vanish every morning and reappear each evening.
create view v_elevated_streak with (security_invoker = true) as
select
  user_id,
  days       as current_streak_days,
  started_on as streak_started_on,
  ended_on   as streak_ended_on
from v_elevated_episodes
where ended_on >= current_date - 1;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create trigger symptom_logs_updated_at before update on symptom_logs
  for each row execute function set_updated_at();

-- Create a profile row automatically on signup so the app never has to handle
-- a signed-in user without one.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Every table is owner-only. The clinician web app never authenticates as the
-- patient; it reads through the service role after verifying a rotating code,
-- and the service role bypasses RLS by design.

alter table profiles      enable row level security;
alter table symptom_logs  enable row level security;
alter table medications   enable row level security;
alter table totp_secrets  enable row level security;
alter table access_grants enable row level security;
alter table code_attempts enable row level security;

create policy profiles_owner on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy symptom_logs_owner on symptom_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy medications_owner on medications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The patient may read and rotate their own secret, but the web app must never
-- be able to enumerate secrets with an anon key.
create policy totp_secrets_owner on totp_secrets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grants are written server-side by the service role; the patient reads them.
create policy access_grants_owner_read on access_grants
  for select using (auth.uid() = user_id);

-- code_attempts is service-role only: no policy, RLS on, so clients see nothing.
