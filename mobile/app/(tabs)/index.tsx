import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Check, ChevronLeft, Pencil, Settings } from 'lucide-react-native';

import { useAuth } from '../../src/lib/auth';
import {
  clearDraft,
  emptyDraft,
  fetchLog,
  fetchProfile,
  loadDraft,
  logToDraft,
  saveDraft,
  saveLog,
  todayIso,
  type Draft,
} from '../../src/lib/logs';
import { useCachedQuery, invalidateCache } from '../../src/lib/cache';
import { reconcileReminder, requestPermission } from '../../src/lib/notifications';
import { DOMAINS, severityBand, severityColor } from '../../src/shared/symptoms';
import type { Profile, SymptomLog } from '../../src/shared/types';
import { RatingScale, YesNo } from '../../src/components/RatingScale';
import { TodaySkeleton } from '../../src/components/Skeleton';
import { Body, Button, Card, Heading, Meta, Screen, Title } from '../../src/components/ui';
import { useTheme, radius, space, type as t } from '../../src/lib/theme';

// One question per screen. Ten sliders on a single page reads as a form to fill
// in; a guided sequence reads as something you can finish, which is the
// difference between logging most days and abandoning it in week two.

const IMPACT_STEP = DOMAINS.length;
const NOTES_STEP = DOMAINS.length + 1;
const REVIEW_STEP = DOMAINS.length + 2;
const TOTAL_STEPS = DOMAINS.length + 3;

interface TodayData {
  log: SymptomLog | null;
  profile: Profile | null;
}

export default function TodayScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const userId = session?.user.id;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedSeverity, setSavedSeverity] = useState<number | null>(null);
  const [alreadyLogged, setAlreadyLogged] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Cached per user+day, so it naturally invalidates itself after midnight.
  // Fetching is now owned by useCachedQuery; the effect below just derives
  // this screen's local state from whatever it returns, on first load and on
  // every silent background refresh.
  const cacheKey = userId ? `today:${userId}:${todayIso()}` : null;
  const { data, loading, reload } = useCachedQuery<TodayData>(cacheKey, async () => {
    const [log, profile] = await Promise.all([fetchLog(userId!, todayIso()), fetchProfile(userId!)]);
    return { log, profile };
  });

  // The last log actually confirmed saved, so Cancel can restore to it
  // instantly without a network round trip — see the Cancel button below.
  const savedLogRef = useRef<SymptomLog | null>(null);

  useEffect(() => {
    if (!data) return;
    savedLogRef.current = data.log;

    if (data.log) {
      setAlreadyLogged(true);
      setSavedSeverity(data.log.severity);
      setDraft((prev) => (editing ? prev : logToDraft(data.log!)));
    } else {
      setAlreadyLogged(false);
      setSavedSeverity(null);
      if (!editing) {
        // A part-finished entry from earlier today is restored where it left off.
        void loadDraft().then((d) => setDraft(d ?? emptyDraft()));
      }
    }

    if (data.profile) {
      void reconcileReminder({
        enabled: data.profile.reminder_enabled,
        time: data.profile.reminder_time.slice(0, 5),
        loggedToday: Boolean(data.log),
      });
    }
    // `editing` is read but deliberately excluded: this should only re-derive
    // when fresh data arrives, not every time the user toggles edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // Persist the draft on every change so backgrounding or a crash never costs
  // answers.
  useEffect(() => {
    if (draft && !alreadyLogged) void saveDraft(draft);
  }, [draft, alreadyLogged]);

  if (!userId || loading || !draft) return <TodaySkeleton />;

  const step = draft.step;
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  async function persist() {
    if (!userId || !draft) return;
    setSaving(true);
    try {
      const log = await saveLog(userId, draft);
      await clearDraft();
      savedLogRef.current = log;
      setSavedSeverity(log.severity);
      setAlreadyLogged(true);
      setEditing(false);

      // Trends may already have this range cached from an earlier visit —
      // without invalidating it, switching there right after saving would
      // briefly show yesterday's numbers before quietly correcting itself.
      invalidateCache(`trends:${userId}`);
      void reload();

      // Ask for notification permission only now — after the patient has seen
      // what the app is for and completed something.
      const granted = await requestPermission();
      if (granted && data?.profile?.reminder_enabled) {
        await reconcileReminder({
          enabled: true,
          time: data.profile.reminder_time.slice(0, 5),
          loggedToday: true,
        });
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // --- Already logged, not editing -----------------------------------------

  if (alreadyLogged && !editing) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Title>Logged today</Title>
            <Meta>{formatToday()}</Meta>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityLabel="Settings"
            accessibilityRole="button"
            hitSlop={12}
          >
            <Settings size={22} strokeWidth={1.5} color={theme.muted} />
          </Pressable>
        </View>

        <Card>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Meta>Today&apos;s overall score</Meta>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              {savedSeverity !== null && (
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: radius.full,
                    backgroundColor: severityColor(savedSeverity),
                  }}
                />
              )}
              <Body>
                <Heading>{savedSeverity ?? '–'}</Heading>
              </Body>
            </View>
            <Meta>
              {savedSeverity === null
                ? 'No ratings recorded'
                : `${severityBand(savedSeverity)} · out of 100`}
            </Meta>
          </View>
        </Card>

        <Button
          label="Edit today's entry"
          variant="secondary"
          onPress={() => {
            setEditing(true);
            setDraft({ ...draft, step: 0 });
          }}
          icon={<Pencil size={17} strokeWidth={1.5} color={theme.ink} />}
        />

        <Button label="See trends" variant="ghost" onPress={() => router.push('/trends')} />
      </Screen>
    );
  }

  // --- Guided flow ----------------------------------------------------------

  const domain = step < DOMAINS.length ? DOMAINS[step] : null;
  const ratingValue = domain ? (draft.ratings[domain.key] ?? null) : null;
  const answered = domain ? domain.key in draft.ratings : false;

  const canAdvance = (() => {
    if (domain) return answered;
    if (step === IMPACT_STEP) return draft.missed_work !== null && draft.took_pain_medication !== null;
    return true;
  })();

  return (
    <Screen>
      <ProgressBar step={step} total={TOTAL_STEPS} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 }}>
        {step > 0 && (
          <Pressable
            onPress={() => update({ step: step - 1 })}
            accessibilityLabel="Previous question"
            accessibilityRole="button"
            hitSlop={12}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <ChevronLeft size={18} strokeWidth={1.5} color={theme.muted} />
            <Meta>Back</Meta>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Meta>
          {step + 1} of {TOTAL_STEPS}
        </Meta>
      </View>

      {domain && (
        <View style={{ gap: space.xl }}>
          <Heading>{domain.question}</Heading>

          <RatingScale
            value={ratingValue}
            onChange={(v) => update({ ratings: { ...draft.ratings, [domain.key]: v } })}
          />

          {domain.allowNotApplicable && (
            <Pressable
              onPress={() =>
                update({
                  // Null, not zero. "Didn't apply today" and "applied and didn't
                  // hurt" are different facts, and storing the first as the
                  // second understates the patient's pain in every average.
                  ratings: { ...draft.ratings, [domain.key]: null },
                  step: step + 1,
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => ({
                alignSelf: 'center',
                paddingVertical: space.md,
                paddingHorizontal: space.lg,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Meta>Didn&apos;t apply today</Meta>
            </Pressable>
          )}
        </View>
      )}

      {step === IMPACT_STEP && (
        <View style={{ gap: space.xl }}>
          <Heading>How did today affect you?</Heading>

          <View style={{ gap: space.md }}>
            <Body>Did symptoms cause you to miss work or school today?</Body>
            <YesNo value={draft.missed_work} onChange={(v) => update({ missed_work: v })} />
          </View>

          <View style={{ gap: space.md }}>
            <Body>Did you take pain medication today?</Body>
            <YesNo
              value={draft.took_pain_medication}
              onChange={(v) => update({ took_pain_medication: v })}
            />

            {draft.took_pain_medication && (
              <TextInput
                value={draft.medication_name}
                onChangeText={(v) => update({ medication_name: v })}
                placeholder="What did you take? (optional)"
                placeholderTextColor={theme.faint}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: theme.line,
                  borderRadius: radius.lg,
                  backgroundColor: theme.card,
                  paddingHorizontal: space.md,
                  color: theme.ink,
                  ...t.body,
                }}
              />
            )}
          </View>
        </View>
      )}

      {step === NOTES_STEP && (
        <View style={{ gap: space.lg }}>
          <Heading>Anything else about today?</Heading>
          <Meta>Optional. Triggers, what helped, how you slept — whatever you want to remember.</Meta>
          <TextInput
            value={draft.notes}
            onChangeText={(v) => update({ notes: v })}
            placeholder="Notes"
            placeholderTextColor={theme.faint}
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 140,
              borderWidth: 1,
              borderColor: theme.line,
              borderRadius: radius.lg,
              backgroundColor: theme.card,
              padding: space.md,
              color: theme.ink,
              ...t.body,
            }}
          />
        </View>
      )}

      {step === REVIEW_STEP && (
        <View style={{ gap: space.lg }}>
          <Heading>Check your entry</Heading>
          <Card style={{ gap: space.md, padding: 0 }}>
            {DOMAINS.map((d, i) => {
              const value = draft.ratings[d.key];
              const recorded = d.key in draft.ratings;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => update({ step: i })}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${d.label}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: space.lg,
                    paddingVertical: space.md,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.line,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Body>{d.label}</Body>
                  <Body muted>
                    {!recorded ? 'Not answered' : value === null ? 'n/a' : `${value} / 10`}
                  </Body>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => update({ step: IMPACT_STEP })}
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.line,
                gap: 4,
              }}
            >
              <Body>Missed work or school</Body>
              <Body muted>{draft.missed_work ? 'Yes' : 'No'}</Body>
            </Pressable>

            <Pressable
              onPress={() => update({ step: IMPACT_STEP })}
              style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: 4 }}
            >
              <Body>Pain medication</Body>
              <Body muted>
                {draft.took_pain_medication
                  ? draft.medication_name.trim() || 'Yes'
                  : 'No'}
              </Body>
            </Pressable>
          </Card>

          {draft.notes.trim().length > 0 && (
            <Card>
              <Meta>Notes</Meta>
              <Body>{draft.notes.trim()}</Body>
            </Card>
          )}
        </View>
      )}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        {step === REVIEW_STEP ? (
          <Button
            label={alreadyLogged ? 'Save changes' : 'Save entry'}
            onPress={persist}
            loading={saving}
            icon={<Check size={18} strokeWidth={1.5} color={theme.accentContrast} />}
          />
        ) : (
          <Button
            label="Next"
            onPress={() => update({ step: step + 1 })}
            disabled={!canAdvance}
          />
        )}

        {/* Skipping is explicit and writes null. Without it, the only way past a
            question is to invent a number, which is worse data than no data. */}
        {domain && !answered && (
          <Button
            label="Skip this question"
            variant="ghost"
            onPress={() =>
              update({ ratings: { ...draft.ratings, [domain.key]: null }, step: step + 1 })
            }
          />
        )}

        {editing && (
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              // Restored from the last confirmed save, not re-fetched — the
              // data hasn't changed on the server, only the in-progress edit
              // is being discarded, so there's nothing worth a network call.
              const saved = savedLogRef.current;
              setDraft(saved ? logToDraft(saved) : emptyDraft());
              setAlreadyLogged(Boolean(saved));
              setSavedSeverity(saved?.severity ?? null);
              setEditing(false);
            }}
          />
        )}
      </View>
    </Screen>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`Step ${step + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 3,
            borderRadius: radius.full,
            backgroundColor: i <= step ? theme.accent : theme.line,
          }}
        />
      ))}
    </View>
  );
}

function formatToday(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
