import { View } from 'react-native';
import { LogIn, ShieldCheck } from 'lucide-react-native';

import { useAuth } from '../src/lib/auth';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { Body, Button, Meta, Screen, Title } from '../src/components/ui';
import { useTheme, space } from '../src/lib/theme';

export default function LoginScreen() {
  const { signInWithGoogle, error } = useAuth();
  const theme = useTheme();

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <Title>Symptom Diary</Title>
          <Body muted>
            A minute a day to record how you felt, so patterns are visible to you — and to your
            doctor when it matters.
          </Body>
        </View>

        <View style={{ gap: space.md }}>
          <Button
            label="Continue with Google"
            onPress={signInWithGoogle}
            disabled={!isSupabaseConfigured}
            icon={<LogIn size={18} strokeWidth={1.5} color={theme.accentContrast} />}
          />

          {!isSupabaseConfigured && (
            <Meta>
              Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env, then restart the dev server.
            </Meta>
          )}

          {error && (
            <Meta>{error}</Meta>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <ShieldCheck size={15} strokeWidth={1.5} color={theme.muted} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Meta>
              Signing in with Google means this app never handles your password. Your symptom
              entries are private to you until you choose to share them.
            </Meta>
          </View>
        </View>
      </View>
    </Screen>
  );
}
