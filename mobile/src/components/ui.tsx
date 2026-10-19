import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, radius, space, type as t } from '../lib/theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const theme = useTheme();
  const inner = (
    <View style={{ padding: padded ? space.lg : 0, gap: space.lg, flexGrow: 1 }}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderColor: theme.line,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderRadius: radius.lg,
          padding: space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[t.title, { color: theme.ink }]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[t.heading, { color: theme.ink }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const theme = useTheme();
  return (
    <Text style={[t.body, { color: muted ? theme.muted : theme.ink, lineHeight: 22 }]}>
      {children}
    </Text>
  );
}

export function Meta({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[t.meta, { color: theme.muted, lineHeight: 17 }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: { bg: theme.accent, fg: theme.accentContrast, border: 'transparent' },
    secondary: { bg: theme.card, fg: theme.ink, border: theme.line },
    ghost: { bg: 'transparent', fg: theme.muted, border: 'transparent' },
    danger: { bg: 'transparent', fg: theme.danger, border: theme.line },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        borderRadius: radius.lg,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
        opacity: inactive ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : icon}
      <Text style={[t.body, { color: palette.fg, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

/** Week / Month / Year and similar. Pink marks the selection. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: theme.card,
        borderColor: theme.line,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderRadius: radius.lg,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md,
              backgroundColor: active ? theme.accent : 'transparent',
            }}
          >
            <Text
              style={[
                t.label,
                { color: active ? theme.accentContrast : theme.muted, fontWeight: active ? '600' : '500' },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: theme.line }} />;
}

export function Row({
  label,
  value,
  onPress,
  right,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 48,
        gap: space.md,
      }}
    >
      <Text style={[t.body, { color: theme.ink, flexShrink: 1 }]}>{label}</Text>
      {right ?? (value ? <Text style={[t.body, { color: theme.muted }]}>{value}</Text> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}>
      <ActivityIndicator color={theme.muted} />
    </View>
  );
}
