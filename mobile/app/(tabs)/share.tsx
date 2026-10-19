import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Circle } from 'react-native-svg';
import { Check, Copy, RefreshCw } from 'lucide-react-native';

import { useAuth } from '../../src/lib/auth';
import { getOrCreateSecret, revokeSecret, rotateSecret } from '../../src/lib/access-code';
import { formatCode, generateCode, secondsRemaining, TOTP_STEP_SECONDS } from '../../src/shared/totp';
import { Body, Button, Card, Meta, Screen, Title } from '../../src/components/ui';
import { useTheme, radius, space, type as t } from '../../src/lib/theme';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'localhost:3000';

export default function ShareScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const userId = session?.user.id;

  const [secret, setSecret] = useState<Uint8Array | null>(null);
  const [code, setCode] = useState<string>('');
  const [remaining, setRemaining] = useState(TOTP_STEP_SECONDS);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setSecret(await getOrCreateSecret(userId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sharing code.');
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Codes are computed on-device from the cached secret, so this keeps ticking
  // with no connection — which is exactly when it is needed, in a consulting
  // room with no signal.
  useEffect(() => {
    if (!secret) return;

    const tick = () => {
      setCode(generateCode(secret));
      setRemaining(secondsRemaining());
    };

    tick();
    timer.current = setInterval(tick, 500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [secret]);

  async function copy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function confirmRotate() {
    Alert.alert(
      'Generate a new code?',
      'Anyone currently using the old code will lose access the next time they sign in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            setBusy(true);
            try {
              setSecret(await rotateSecret(userId));
              setRevoked(false);
            } catch (e) {
              Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  function confirmRevoke() {
    Alert.alert(
      'Stop sharing?',
      'No new codes will work. Anyone already viewing your record keeps access until their session ends.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop sharing',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            setBusy(true);
            try {
              await revokeSecret(userId);
              setSecret(null);
              setCode('');
              setRevoked(true);
            } catch (e) {
              Alert.alert('Could not revoke', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>Share with a doctor</Title>
        <Meta>Read the code below to your doctor, or type it in for them.</Meta>
      </View>

      <Card style={{ alignItems: 'center', gap: space.lg, paddingVertical: space.xl }}>
        {error ? (
          <>
            <Body muted>{error}</Body>
            <Button label="Try again" variant="secondary" onPress={load} />
          </>
        ) : revoked ? (
          <>
            <Body muted>Sharing is off. No code will open your record.</Body>
          </>
        ) : !secret ? (
          <>
            <ActivityIndicator color={theme.muted} />
            <Meta>Preparing your code</Meta>
          </>
        ) : (
          <>
            <Text
              accessibilityLabel={`Access code ${code.split('').join(' ')}`}
              style={{
                fontSize: 40,
                fontWeight: '600',
                letterSpacing: 4,
                color: theme.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatCode(code)}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <CountdownRing remaining={remaining} />
              <Meta>
                {remaining === 1 ? 'Changes in 1 second' : `Changes in ${remaining} seconds`}
              </Meta>
            </View>

            <Pressable
              onPress={copy}
              accessibilityRole="button"
              accessibilityLabel="Copy code"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingVertical: space.sm,
                paddingHorizontal: space.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {copied ? (
                <Check size={15} strokeWidth={1.5} color={theme.accent} />
              ) : (
                <Copy size={15} strokeWidth={1.5} color={theme.muted} />
              )}
              <Text style={[t.label, { color: copied ? theme.accent : theme.muted }]}>
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </>
        )}
      </Card>

      <Card style={{ gap: space.sm }}>
        <Text style={[t.label, { color: theme.ink }]}>How your doctor uses it</Text>
        <Meta>
          1. They open {WEB_URL} on any device.{'\n'}
          2. They type this 8-character code.{'\n'}
          3. They get read-only access to your symptom history for 30 minutes.
        </Meta>
      </Card>

      <Meta>
        The code changes every minute, so an old one is useless. Letters that are easy to confuse —
        I, L, O and U — never appear, so it is safe to read aloud. Your doctor can never change your
        entries, and every time your record is opened it is recorded here.
      </Meta>

      <View style={{ gap: space.sm }}>
        {revoked ? (
          <Button
            label="Start sharing again"
            onPress={async () => {
              if (!userId) return;
              setBusy(true);
              try {
                setSecret(await rotateSecret(userId));
                setRevoked(false);
              } catch (e) {
                Alert.alert('Could not start', e instanceof Error ? e.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            }}
            loading={busy}
          />
        ) : (
          <>
            <Button
              label="Generate a new code"
              variant="secondary"
              onPress={confirmRotate}
              disabled={busy || !secret}
              icon={<RefreshCw size={17} strokeWidth={1.5} color={theme.ink} />}
            />
            {secret && (
              <Button label="Stop sharing" variant="danger" onPress={confirmRevoke} disabled={busy} />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

/** A thin ring draining over the 60-second step. */
function CountdownRing({ remaining }: { remaining: number }) {
  const theme = useTheme();
  const size = 14;
  const r = (size - 2) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = remaining / TOTP_STEP_SECONDS;

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.line} strokeWidth={2} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={theme.accent}
        strokeWidth={2}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
