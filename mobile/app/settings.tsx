import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { X } from 'lucide-react-native';

import { useAuth } from '../src/lib/auth';
import { fetchProfile, todayIso, fetchLog, updateProfile } from '../src/lib/logs';
import { supabase } from '../src/lib/supabase';
import { cancelDailyReminder, reconcileReminder, requestPermission } from '../src/lib/notifications';
import type { Profile } from '../src/shared/types';
import { Body, Button, Card, Divider, Loading, Meta, Row, Screen, Title } from '../src/components/ui';
import { useTheme, space, type as t } from '../src/lib/theme';

interface Grant {
  id: string;
  granted_at: string;
  expires_at: string;
}

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const [p, g] = await Promise.all([
      fetchProfile(userId),
      supabase
        .from('access_grants')
        .select('id, granted_at, expires_at')
        .eq('user_id', userId)
        .order('granted_at', { ascending: false })
        .limit(10),
    ]);
    setProfile(p);
    setGrants((g.data as Grant[] | null) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile || !userId) return <Loading />;

  async function patch(update: Partial<Profile>) {
    if (!userId || !profile) return;
    const next = { ...profile, ...update };
    setProfile(next);
    await updateProfile(userId, update);

    const logged = Boolean(await fetchLog(userId, todayIso()));
    await reconcileReminder({
      enabled: next.reminder_enabled,
      time: next.reminder_time.slice(0, 5),
      loggedToday: logged,
    });
  }

  async function toggleReminder(enabled: boolean) {
    if (enabled) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          'Notifications are off',
          'Turn on notifications for Symptom Diary in your device settings to get daily reminders.',
        );
        return;
      }
    } else {
      await cancelDailyReminder();
    }
    await patch({ reminder_enabled: enabled });
  }

  const [hh, mm] = profile.reminder_time.slice(0, 5).split(':').map(Number);
  const reminderDate = new Date();
  reminderDate.setHours(hh, mm, 0, 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title>Settings</Title>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" hitSlop={12}>
          <X size={22} strokeWidth={1.5} color={theme.muted} />
        </Pressable>
      </View>

      <Card>
        <Row
          label="Daily reminder"
          right={
            <Switch
              value={profile.reminder_enabled}
              onValueChange={toggleReminder}
              trackColor={{ true: theme.accent, false: theme.line }}
            />
          }
        />
        <Divider />
        <Row
          label="Remind me at"
          value={profile.reminder_time.slice(0, 5)}
          onPress={() => setShowPicker(true)}
        />
        {showPicker && (
          <DateTimePicker
            value={reminderDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event, date) => {
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (!date) return;
              const time = `${String(date.getHours()).padStart(2, '0')}:${String(
                date.getMinutes(),
              ).padStart(2, '0')}`;
              void patch({ reminder_time: time });
            }}
          />
        )}
        {Platform.OS === 'ios' && showPicker && (
          <Button label="Done" variant="ghost" onPress={() => setShowPicker(false)} />
        )}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Row
          label="Allow AI consultation reports"
          right={
            <Switch
              value={Boolean(profile.ai_report_consent_at)}
              onValueChange={(on) =>
                patch({ ai_report_consent_at: on ? new Date().toISOString() : null })
              }
              trackColor={{ true: theme.accent, false: theme.line }}
            />
          }
        />
        <Meta>
          When this is on, your doctor can ask the website to write a summary of your entries. Doing
          that sends your symptom data to a third-party AI service. With it off, your doctor can
          still read your full record — they just cannot generate a summary.
        </Meta>
      </Card>

      <View style={{ gap: space.sm }}>
        <Text style={[t.subheading, { color: theme.ink }]}>Who has opened your record</Text>
        <Card style={{ gap: space.sm }}>
          {grants.length === 0 ? (
            <Meta>Nobody has used a code to open your record yet.</Meta>
          ) : (
            grants.map((grant, i) => (
              <View key={grant.id}>
                {i > 0 && <Divider />}
                <View style={{ paddingVertical: space.sm, gap: 2 }}>
                  <Body>{formatDateTime(grant.granted_at)}</Body>
                  <Meta>Read-only access, expired {formatDateTime(grant.expires_at)}</Meta>
                </View>
              </View>
            ))
          )}
        </Card>
      </View>

      <View style={{ gap: space.sm }}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        <Button
          label="Delete my account and data"
          variant="danger"
          onPress={() =>
            Alert.alert(
              'Delete everything?',
              'Your account and every symptom entry will be permanently removed. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    Alert.alert(
                      'Not available yet',
                      'Account deletion needs a server function with admin rights. Until that is deployed, contact support to have your data removed.',
                    ),
                },
              ],
            )
          }
        />
      </View>

      <Meta>Signed in as {session?.user.email}</Meta>
    </Screen>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
