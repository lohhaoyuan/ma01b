import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';

import { useTheme, radius, space } from '../lib/theme';

/** A pulsing placeholder block, shaped like the real content it stands in for. */
export function SkeletonBlock({
  width,
  height,
  radius: r = radius.md,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: r, backgroundColor: theme.line, opacity }}
    />
  );
}

/** Matches trends.tsx's real layout: heading, segmented control, chart, stat tiles, symptom grid. */
export function TrendsSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: 6 }}>
        <SkeletonBlock width={100} height={28} />
        <SkeletonBlock width={160} height={15} />
      </View>

      <SkeletonBlock width="100%" height={40} radius={radius.lg} />

      <View
        style={{
          borderColor: theme.line,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.md,
          gap: space.md,
        }}
      >
        <SkeletonBlock width={110} height={15} />
        <SkeletonBlock width="100%" height={180} />
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <SkeletonBlock width="48%" height={82} radius={radius.lg} />
        <SkeletonBlock width="48%" height={82} radius={radius.lg} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <SkeletonBlock width="48%" height={82} radius={radius.lg} />
        <SkeletonBlock width="48%" height={82} radius={radius.lg} />
      </View>

      <View style={{ gap: space.md }}>
        <SkeletonBlock width={110} height={20} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonBlock key={i} width="47%" height={100} radius={radius.lg} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** Matches index.tsx's "already logged" card layout — the more common return state. */
export function TodaySkeleton() {
  const theme = useTheme();
  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <View style={{ gap: 6 }}>
        <SkeletonBlock width={140} height={28} />
        <SkeletonBlock width={120} height={15} />
      </View>

      <View
        style={{
          borderColor: theme.line,
          borderWidth: 1,
          borderRadius: radius.lg,
          padding: space.lg,
          alignItems: 'center',
          gap: space.sm,
        }}
      >
        <SkeletonBlock width={90} height={13} />
        <SkeletonBlock width={60} height={40} />
        <SkeletonBlock width={110} height={13} />
      </View>

      <SkeletonBlock width="100%" height={48} radius={radius.lg} />
      <SkeletonBlock width="100%" height={48} radius={radius.lg} />
    </View>
  );
}
