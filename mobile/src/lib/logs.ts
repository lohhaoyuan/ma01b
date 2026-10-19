import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import type { DomainKey } from '../shared/symptoms';
import type { ElevatedStreak, Profile, SymptomLog } from '../shared/types';

export type Draft = {
  log_date: string;
  ratings: Partial<Record<DomainKey, number | null>>;
  missed_work: boolean | null;
  took_pain_medication: boolean | null;
  medication_name: string;
  notes: string;
  step: number;
};

const DRAFT_KEY = 'log.draft';

export function todayIso(): string {
  // Local calendar date, not UTC. A log made at 11pm belongs to that evening,
  // and using UTC would file it under tomorrow for anyone east of Greenwich.
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function isoDaysAgo(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// --- Draft, so a half-finished entry survives the app being backgrounded -----

export async function saveDraft(draft: Draft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function loadDraft(): Promise<Draft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Draft;
    // A draft from a previous day is stale: it would silently file yesterday's
    // half-answers under today.
    if (draft.log_date !== todayIso()) {
      await clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

// --- Reads ------------------------------------------------------------------

export async function fetchLog(userId: string, date: string): Promise<SymptomLog | null> {
  const { data } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  return (data as SymptomLog | null) ?? null;
}

export async function fetchLogs(userId: string, from: string, to: string): Promise<SymptomLog[]> {
  const { data } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to)
    .order('log_date', { ascending: true });
  return (data as SymptomLog[] | null) ?? [];
}

export async function fetchStreak(userId: string): Promise<ElevatedStreak | null> {
  const { data } = await supabase
    .from('v_elevated_streak')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ElevatedStreak | null) ?? null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<void> {
  await supabase.from('profiles').update(patch).eq('id', userId);
}

// --- Writes -----------------------------------------------------------------

export async function saveLog(userId: string, draft: Draft): Promise<SymptomLog> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .upsert(
      {
        user_id: userId,
        log_date: draft.log_date,
        pelvic_pain: draft.ratings.pelvic_pain ?? null,
        menstrual_pain: draft.ratings.menstrual_pain ?? null,
        lower_back_pain: draft.ratings.lower_back_pain ?? null,
        bowel_pain: draft.ratings.bowel_pain ?? null,
        urination_pain: draft.ratings.urination_pain ?? null,
        sex_pain: draft.ratings.sex_pain ?? null,
        fatigue: draft.ratings.fatigue ?? null,
        bloating: draft.ratings.bloating ?? null,
        missed_work: draft.missed_work ?? false,
        took_pain_medication: draft.took_pain_medication ?? false,
        notes: draft.notes.trim() || null,
      },
      { onConflict: 'user_id,log_date' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  const log = data as SymptomLog;

  // Medication detail is optional; replace rather than accumulate, so editing
  // the same day twice does not record the dose twice.
  await supabase.from('medications').delete().eq('log_id', log.id);
  if (draft.took_pain_medication && draft.medication_name.trim()) {
    await supabase.from('medications').insert({
      user_id: userId,
      log_id: log.id,
      name: draft.medication_name.trim(),
    });
  }

  return log;
}

/** Turn a saved log back into a draft so it can be edited in the same flow. */
export function logToDraft(log: SymptomLog): Draft {
  return {
    log_date: log.log_date,
    ratings: {
      pelvic_pain: log.pelvic_pain,
      menstrual_pain: log.menstrual_pain,
      lower_back_pain: log.lower_back_pain,
      bowel_pain: log.bowel_pain,
      urination_pain: log.urination_pain,
      sex_pain: log.sex_pain,
      fatigue: log.fatigue,
      bloating: log.bloating,
    },
    missed_work: log.missed_work,
    took_pain_medication: log.took_pain_medication,
    medication_name: '',
    notes: log.notes ?? '',
    step: 0,
  };
}

export function emptyDraft(date: string = todayIso()): Draft {
  return {
    log_date: date,
    ratings: {},
    missed_work: null,
    took_pain_medication: null,
    medication_name: '',
    notes: '',
    step: 0,
  };
}
