import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TriangleAlert, X } from 'lucide-react-native';

import { useAuth } from '../../src/lib/auth';
import { fetchLogs, fetchStreak, isoDaysAgo, todayIso } from '../../src/lib/logs';
import { useCachedQuery } from '../../src/lib/cache';
import { DOMAINS, severityBand, severityColor, STREAK_DAYS_FOR_ALERT } from '../../src/shared/symptoms';
import { RANGE_DAYS, RANGE_LABELS, type RangeKey, type SymptomLog, type ElevatedStreak } from '../../src/shared/types';
import { SeverityChart, Sparkline } from '../../src/components/Charts';
import { TrendsSkeleton } from '../../src/components/Skeleton';
import { Card, Heading, Meta, Screen, SegmentedControl, Title } from '../../src/components/ui';
import { useTheme, radius, space, type as t } from '../../src/lib/theme';
import { Text } from 'react-native';

const DISMISS_KEY = 'banner.dismissedUntil';

interface TrendsData {
  logs: SymptomLog[];
  streak: ElevatedStreak | null;
}

export default function TrendsScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const userId = session?.user.id;
  const [range, setRange] = useState<RangeKey>('week');
  const [dismissedDays, setDismissedDays] = useState<number | null>(null);

  // One fetch, not one per range: Month and Year are both just Week's window
  // extended further back, so fetching the full year up front and slicing it
  // client-side per range means switching Week/Month/Year never has to touch
  // the network again after this loads once — no fetch, no skeleton, just an
  // instant re-filter of data already in memory.
  const cacheKey = userId ? `trends:${userId}` : null;
  const { data, loading, reload } = useCachedQuery<TrendsData>(cacheKey, async () => ({
    logs: await fetchLogs(userId!, isoDaysAgo(RANGE_DAYS.year - 1), todayIso()),
    streak: await fetchStreak(userId!),
  }));

  // Revisiting the tab re-fetches silently in the background (data may have
  // changed, e.g. a log was saved elsewhere) — but only when there's already
  // something cached for this key does that stay invisible; a genuinely new
  // key still shows the skeleton via `loading` above.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    void AsyncStorage.getItem(DISMISS_KEY).then((v) => setDismissedDays(v ? Number(v) : null));
  }, []);

  if (!userId || loading || !data) return <TrendsSkeleton />;

  // Pure client-side slice of the already-fetched year — this is what makes
  // switching ranges free. ISO date strings sort lexicographically the same
  // as chronologically, so a plain string comparison is enough.
  const rangeStart = isoDaysAgo(RANGE_DAYS[range] - 1);
  const logs = data.logs.filter((l) => l.log_date >= rangeStart);
  const { streak } = data;
  const severities = logs.map((l) => l.severity).filter((s): s is number => s !== null);
  const meanSeverity = severities.length
    ? Math.round(severities.reduce((a, b) => a + b, 0) / severities.length)
    : null;
  const worst = severities.length ? Math.max(...severities) : null;
  const missedWork = logs.filter((l) => l.missed_work).length;
  const medicationDays = logs.filter((l) => l.took_pain_medication).length;

  // The banner is dismissible, but dismissing it records the streak length at
  // the time. If the streak grows the banner comes back — a worsening run
  // should not stay hidden because it was waved away when it was shorter.
  const streakDays = streak?.current_streak_days ?? 0;
  const showBanner =
    streakDays >= STREAK_DAYS_FOR_ALERT && (dismissedDays === null || streakDays > dismissedDays);

  async function dismissBanner() {
    await AsyncStorage.setItem(DISMISS_KEY, String(streakDays));
    setDismissedDays(streakDays);
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>Trends</Title>
        <Meta>
          {logs.length} of {RANGE_DAYS[range]} days logged
        </Meta>
      </View>

      {showBanner && streak && (
        <View
          style={{
            flexDirection: 'row',
            gap: space.md,
            backgroundColor: theme.accentSoft,
            borderColor: theme.accent,
            borderWidth: 1,
            borderRadius: radius.lg,
            padding: space.lg,
          }}
        >
          <TriangleAlert size={18} strokeWidth={1.5} color={theme.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={[t.subheading, { color: theme.ink }]}>
              {streakDays} days of elevated symptoms
            </Text>
            <Meta>
              Your symptoms have stayed high every day since{' '}
              {formatDate(streak.streak_started_on)}. It may be worth booking time with a doctor.
              You can share this record with them from the Share tab.
            </Meta>
            <Pressable
              onPress={() => router.push('/share')}
              accessibilityRole="button"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 4 })}
            >
              <Text style={[t.label, { color: theme.accent }]}>Prepare for a visit →</Text>
            </Pressable>
          </View>
          <Pressable onPress={dismissBanner} accessibilityLabel="Dismiss" hitSlop={12}>
            <X size={17} strokeWidth={1.5} color={theme.muted} />
          </Pressable>
        </View>
      )}

      <SegmentedControl
        value={range}
        onChange={setRange}
        options={(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => ({
          value: key,
          label: RANGE_LABELS[key],
        }))}
      />

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={[t.label, { color: theme.ink }]}>Overall severity</Text>
          <Meta>out of 100</Meta>
        </View>
        <SeverityChart points={logs.map((l) => ({ date: l.log_date, value: l.severity }))} />
      </Card>

      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Stat label="Average" value={meanSeverity} caption={meanSeverity === null ? 'No entries' : severityBand(meanSeverity)} color={meanSeverity !== null ? severityColor(meanSeverity) : undefined} />
        <Stat label="Worst day" value={worst} caption={worst === null ? '—' : severityBand(worst)} color={worst !== null ? severityColor(worst) : undefined} />
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Stat label="Missed work/school" value={missedWork} caption={`of ${logs.length} logged days`} />
        <Stat label="Medication days" value={medicationDays} caption={`of ${logs.length} logged days`} />
      </View>

      <View style={{ gap: space.md }}>
        <Heading>By symptom</Heading>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {DOMAINS.map((domain) => {
            const values = logs
              .map((l) => l[domain.key])
              .filter((v): v is number => v !== null && v !== undefined);
            const mean = values.length
              ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
              : null;

            return (
              <Sparkline
                key={domain.key}
                label={domain.label}
                mean={mean}
                answered={values.length}
                skipped={logs.length - values.length}
                points={logs.map((l) => ({ date: l.log_date, value: l[domain.key] }))}
              />
            );
          })}
        </View>
      </View>

      <Meta>
        The overall score weighs pelvic and menstrual pain most heavily. Questions you skip or mark
        as not applicable are left out of the average rather than counted as zero.
      </Meta>
    </Screen>
  );
}

function Stat({
  label,
  value,
  caption,
  color,
}: {
  label: string;
  value: number | null;
  caption: string;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        backgroundColor: theme.card,
        borderColor: theme.line,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: space.md,
        gap: 4,
      }}
    >
      <Meta>{label}</Meta>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {color && (
          <View style={{ width: 9, height: 9, borderRadius: radius.full, backgroundColor: color }} />
        )}
        <Text
          style={{
            fontSize: 24,
            fontWeight: '600',
            letterSpacing: -0.4,
            color: theme.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value ?? '—'}
        </Text>
      </View>
      <Meta>{caption}</Meta>
    </View>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  });
}
