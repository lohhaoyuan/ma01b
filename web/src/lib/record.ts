import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { readSessionToken, SESSION_COOKIE } from './session';
import { serviceClient } from './supabase';
import { aggregate, isoDaysAgo, isoToday, type Aggregate } from './aggregate';
import { RANGE_DAYS, type RangeKey, type SymptomLog, type Medication, type ElevatedEpisode, type Profile, type ElevatedStreak } from '@/shared/types';

// Every read of patient data goes through here. The user id comes from the
// signed cookie and nowhere else — never a query parameter — so a clinician who
// has unlocked one record cannot reach another by editing the URL.

export interface RecordData {
  userId: string;
  expiresAt: string;
  profile: Profile | null;
  logs: SymptomLog[];
  medications: Medication[];
  episodes: ElevatedEpisode[];
  streak: ElevatedStreak | null;
  stats: Aggregate;
  range: RangeKey;
  from: string;
  to: string;
}

export function parseRange(value: string | undefined): RangeKey {
  return value === 'week' || value === 'month' || value === 'year' ? value : 'month';
}

export async function loadRecord(range: RangeKey): Promise<RecordData> {
  const jar = await cookies();
  const claims = await readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!claims) redirect('/?expired=1');

  const userId = claims.sub;
  const to = isoToday();
  const from = isoDaysAgo(RANGE_DAYS[range] - 1);

  const [profileRes, logsRes, episodesRes, streakRes] = await Promise.all([
    serviceClient.from('profiles').select('*').eq('id', userId).maybeSingle(),
    serviceClient
      .from('symptom_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_date', { ascending: true }),
    serviceClient.from('v_elevated_episodes').select('*').eq('user_id', userId).order('started_on'),
    serviceClient.from('v_elevated_streak').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const logs = (logsRes.data ?? []) as SymptomLog[];

  // Medications are fetched by log id rather than by date, so a log edited to a
  // different date cannot drag someone else's medication rows along with it.
  const logIds = logs.map((l) => l.id);
  const medsRes = logIds.length
    ? await serviceClient.from('medications').select('*').eq('user_id', userId).in('log_id', logIds)
    : { data: [] as Medication[] };

  const medications = (medsRes.data ?? []) as Medication[];
  const episodes = (episodesRes.data ?? []) as ElevatedEpisode[];

  return {
    userId,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    profile: (profileRes.data as Profile | null) ?? null,
    logs,
    medications,
    episodes,
    streak: (streakRes.data as ElevatedStreak | null) ?? null,
    stats: aggregate(logs, medications, episodes, from, to),
    range,
    from,
    to,
  };
}
