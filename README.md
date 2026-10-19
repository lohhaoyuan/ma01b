# Endometriosis Symptom Management

*For those with less technical experience, [click here for a complete guide to setup](SETUP_GUIDE.md).*

Two applications over one Supabase backend.

- **`mobile/`** — Expo / React Native. The patient logs symptoms daily, sees their trends, and
  generates a rotating code to share their record.
- **`web/`** — Next.js. A clinician enters that code to open a read-only view of the record, and
  can generate an AI consultation summary via OpenRouter.
- **`supabase/`** — the schema. Authoritative for the data model and for severity scoring.
- **`shared/`** — code both apps must agree on (TOTP, symptom taxonomy, types). Copied into each
  app by `npm run sync:shared`; `npm run sync:shared:check` fails CI if a copy has drifted.

## Setup

### 1. Supabase

Create a project, run `supabase/migrations/0001_init.sql` in the SQL editor.

Enable **Authentication → Providers → Google**. The app authenticates through a browser-mediated
flow (`expo-web-browser` opening Supabase's `/authorize` URL), not Google's native SDK — so only
a single **Web application** OAuth client is needed in Google Cloud Console, regardless of
target platform. Set its authorized redirect URI to the Supabase callback shown in that panel,
and paste the resulting Client ID/Secret back into Supabase.

Add `symptomdiary://**` to Supabase's **Redirect URLs** allowlist. Without it, Supabase falls
back to the project's default Site URL (`http://localhost:3000`) after a successful Google auth,
and the in-app browser sheet dies trying to load it — the failure mode is a bare "can't connect
to localhost," with no indication it's an auth config problem.

### 2. Web

```bash
cd web && cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`
([openrouter.ai/keys](https://openrouter.ai/keys), needs credit loaded to actually call models),
and a `SESSION_JWT_SECRET` of at least 32 characters (`openssl rand -base64 48`).
`OPENROUTER_MODEL` defaults to `openai/gpt-4o-mini`; any model on
[openrouter.ai/models](https://openrouter.ai/models) works, no code change needed. Then:

```bash
cd web && npm run dev
```

### 3. Mobile

```bash
cd mobile && cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the anon key, never the
service role key — it ships inside the client bundle). Then:

```bash
cd mobile && npx expo start
```

Google sign-in, notifications, and SecureStore all require a development build, not Expo Go —
Expo Go bundles a fixed set of native modules baked in at whatever SDK version it shipped with,
which doesn't reliably match this project's `expo-secure-store` version:

```bash
cd mobile && npx expo run:ios
```

Needs a full Xcode install (not just the Command Line Tools) with its license accepted:
`sudo xcodebuild -license`. Android: `npx expo run:android`.

## Tests

```bash
npm test
```

Runs the schema against a real Postgres (PGlite, no Docker needed) and the access-code
implementation against the RFC 6238 vectors, from the repo root.

```bash
cd web && npm run test:report
```

Calls `generateReport()` directly against live OpenRouter with fixture `Aggregate` data — verifies
the prompt, network call, and runtime shape validation without needing a Supabase session, a
simulator, or a live TOTP code. Runs via `tsx` (plain Node can't resolve the `@/` path alias) with
`NODE_OPTIONS=--conditions=react-server` set (`server-only`'s package.json resolves to a throwing
stub without that condition — Next sets it internally when bundling server code; nothing outside
Next does by default, which is also why `server-only` has to be a real listed dependency here
rather than left implicit the way Next's own scaffolding does it).

## Design decisions worth knowing

**Severity is computed in Postgres, not in either app.** `symptom_logs.severity` is a generated
column. Two independent implementations would eventually disagree, and the visible symptom of that
would be the app showing a doctor-visit alert while the clinician's report says everything is fine.

**A skipped question is null, not zero.** "Didn't apply today" and "applied and didn't hurt" are
different facts. The severity formula drops null domains from both the numerator and the
denominator, so skipping never quietly drags a patient's average down. There is a test for exactly
this.

**"Days missed work/school" and "pain medication days" are stored as daily booleans.** They are
period totals and cannot be answered on a single day, so they are collected daily and summed —
which is also more accurate than asking someone to recall a month.

**The access code is TOTP, not a stored one-time code.** RFC 6238 with a 60-second step, rendered
as 8 Crockford base32 characters. Crockford's alphabet omits I, L, O and U, so the code is safe to
read aloud. Codes are generated offline on the device from a secret cached in SecureStore, so the
share screen works with no signal — which matters in a consulting room.

**Two colour systems, kept apart.** Pink means "interactive" — buttons, selection, focus. The
blue-to-red ramp means "this is how bad it was" and never appears on a control. Severity is always
shown as a numeral next to its colour, so the reading survives colour blindness and greyscale
printing.

**The consultation report is given statistics, not raw rows.** Aggregation happens in
`web/src/lib/aggregate.ts`. Token cost stays flat as history grows, and every figure in the report
is one that can be checked against the database rather than something the model computed.
Generation goes through OpenRouter's OpenAI-compatible chat completions endpoint
(`web/src/lib/report.ts`) via plain `fetch`, not a provider SDK — the model is an env var
(`OPENROUTER_MODEL`), swappable without touching code. The tradeoff: OpenRouter's `json_object`
mode is honoured by most models but isn't server-enforced the way a provider SDK's schema
parameter would be, so `validateReport()` checks the response shape at runtime before it reaches
the page, rather than trusting the model's output blindly.

**Server/client boundaries are easy to get wrong across a page/component split.** `formatDate`
originally lived in `dashboard-parts.tsx` (a `'use client'` file) and was called directly from the
server components in `patient/page.tsx` and `patient/report/page.tsx` — that throws at runtime
("Attempted to call formatDate() from the server but formatDate is on the client"), not at build
time, since Next can't statically prove a plain-data function is being called across the boundary
until it's actually rendered. It now lives in `web/src/lib/format.ts`, a plain module with no
client boundary, importable from both sides. Same watch-out applies to any other pure helper that
gets colocated with client components for convenience.

## Before this goes near real patients

1. **Supabase's free tier carries no HIPAA/PDPA compliance commitment.** Fine for coursework; state
   it in the report rather than assuming it away.
2. **The report sends symptom data to a third-party model via OpenRouter.** Gated behind
   `profiles.ai_report_consent_at`, which the patient sets in the app. Do not remove that gate.
3. **Account deletion is not implemented.** It needs a server function with admin rights; the
   settings screen currently says so rather than pretending to work.
4. **There is no cycle or bleeding field.** Without knowing which days were menstrual days, neither
   the trends view nor the report can separate cyclical pain from constant pain. A single
   `is_menstruating` boolean would unlock that.
