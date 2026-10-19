// Row shapes shared by both apps.
//
// CANONICAL SOURCE. Do not edit the copies under mobile/src/shared or
// web/src/shared — run `npm run sync:shared` from the repo root instead.
//
// These are hand-written to describe the columns both apps actually read. The
// full generated Supabase types live alongside them in each app as
// database.types.ts (`npm run types`); these are the narrowed, friendlier view.

import type { DomainKey } from './symptoms';

export type SymptomRatings = {
  [K in DomainKey]: number | null;
};

export interface SymptomLog extends SymptomRatings {
  id: string;
  user_id: string;
  /** ISO date, no time component. */
  log_date: string;
  missed_work: boolean;
  took_pain_medication: boolean;
  notes: string | null;
  /** Computed by the database. Null when every domain was skipped. */
  severity: number | null;
  created_at: string;
  updated_at: string;
}

export interface Medication {
  id: string;
  log_id: string;
  name: string;
  dose: string | null;
  taken_at: string;
}

export interface ElevatedStreak {
  user_id: string;
  current_streak_days: number;
  streak_started_on: string;
  streak_ended_on: string;
}

export interface ElevatedEpisode {
  user_id: string;
  started_on: string;
  ended_on: string;
  days: number;
}

export interface Profile {
  id: string;
  display_name: string | null;
  reminder_time: string;
  reminder_enabled: boolean;
  ai_report_consent_at: string | null;
}

export type RangeKey = 'week' | 'month' | 'year';

export const RANGE_DAYS: Record<RangeKey, number> = {
  week: 7,
  month: 30,
  year: 365,
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};
