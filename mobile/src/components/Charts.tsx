import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme, radius, space, type as t } from '../lib/theme';
import { ELEVATED_THRESHOLD, severityColor } from '../shared/symptoms';

export interface Point {
  date: string;
  value: number | null;
}

/**
 * Composite severity over time.
 *
 * Severity is carried by height on the y-axis; the ramp only fills the dots.
 * That way the chart still reads if the colours are indistinguishable to the
 * viewer, and the dashed threshold line gives an absolute reference rather than
 * asking anyone to judge "how red is red".
 */
export function SeverityChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const data = points.filter((p): p is { date: string; value: number } => p.value !== null);

  if (data.length === 0) {
    return (
      <View
        style={{
          height,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: theme.line,
          borderRadius: radius.lg,
        }}
      >
        <Text style={[t.meta, { color: theme.muted }]}>No entries in this range yet</Text>
      </View>
    );
  }

  const PAD_L = 26;
  const PAD_R = 8;
  const PAD_T = 8;
  const PAD_B = 18;
  const plotW = Math.max(1, width - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;

  const x = (i: number) => PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / 100) * plotH;

  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
  const thresholdY = y(ELEVATED_THRESHOLD);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, 50, 100].map((tick) => (
            <SvgText
              key={tick}
              x={0}
              y={y(tick) + 4}
              fontSize={10}
              fill={theme.muted}
            >
              {tick}
            </SvgText>
          ))}

          <Line
            x1={PAD_L}
            y1={thresholdY}
            x2={width - PAD_R}
            y2={thresholdY}
            stroke={theme.muted}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <Path d={path} stroke={theme.muted} strokeWidth={1.5} fill="none" />

          {data.map((p, i) => (
            <Circle
              key={p.date}
              cx={x(i)}
              cy={y(p.value)}
              r={3.5}
              fill={severityColor(p.value)}
              stroke={theme.card}
              strokeWidth={1}
            />
          ))}

          {/* Drawn last, over a backing rect: the label has to stay readable
              where the threshold line passes behind a data point. */}
          <Rect
            x={width - PAD_R - 48}
            y={thresholdY - 15}
            width={48}
            height={13}
            fill={theme.card}
            rx={2}
          />
          <SvgText x={width - PAD_R} y={thresholdY - 5} fontSize={10} fill={theme.muted} textAnchor="end">
            Elevated
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

/** One small multiple per symptom, all sharing a 0-10 axis. */
export function Sparkline({
  label,
  points,
  mean,
  answered,
  skipped,
}: {
  label: string;
  points: Point[];
  mean: number | null;
  answered: number;
  skipped: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const height = 44;

  const data = points.filter((p): p is { date: string; value: number } => p.value !== null);

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
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[t.label, { color: theme.ink, flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[t.label, { color: theme.ink, fontVariant: ['tabular-nums'] }]}>
          {mean === null ? '—' : mean.toFixed(1)}
        </Text>
      </View>

      <Text style={[t.meta, { color: theme.muted }]}>
        {answered === 0 ? 'Not recorded' : `${answered} d${skipped > 0 ? ` · ${skipped} n/a` : ''}`}
      </Text>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && data.length > 0 && (
          <Svg width={width} height={height}>
            <Path
              d={data
                .map((p, i) => {
                  const px = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
                  const py = height - (p.value / 10) * height;
                  return `${i === 0 ? 'M' : 'L'} ${px} ${py}`;
                })
                .join(' ')}
              stroke={theme.muted}
              strokeWidth={1.5}
              fill="none"
            />
          </Svg>
        )}
      </View>
    </View>
  );
}