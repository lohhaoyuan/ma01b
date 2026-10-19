import { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useTheme, radius, space, type as t } from '../lib/theme';
import {
  contrastTextOn,
  ratingColorAlpha,
  SCALE_ANCHORS,
  SCALE_MAX,
  SCALE_MIN,
} from '../shared/symptoms';

const VALUES = Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => SCALE_MIN + i);

/**
 * A 0-10 numeric rating scale rendered as 11 tappable segments that also
 * respond to dragging.
 *
 * A plain slider is the obvious choice and the wrong one here. Hitting one of
 * 11 positions by dragging means the thumb covers the value being set, so
 * people systematically land a point either side and mid-scale answers become
 * unreliable — which matters when the whole flow is ten of these in a row. The
 * scale is discrete, so discrete targets are the honest control: one tap sets
 * an exact value, and dragging still works for anyone who reaches for it.
 *
 * Colour comes from the severity ramp, but the numeral is always shown too:
 * nobody should have to distinguish orange from red to read their own entry.
 */
export function RatingScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const lastHaptic = useRef<number | null>(null);
  const containerRef = useRef<View>(null);
  // The row's left edge in screen coordinates. Needed because touch handlers
  // below read `pageX` rather than `locationX` — see the comment there for why.
  const containerPageX = useRef(0);

  const GAP = 4;
  const segmentWidth = width > 0 ? (width - GAP * (VALUES.length - 1)) / VALUES.length : 0;

  function valueAtX(x: number): number {
    if (segmentWidth <= 0) return SCALE_MIN;
    const index = Math.floor(x / (segmentWidth + GAP));
    return Math.max(SCALE_MIN, Math.min(SCALE_MAX, index));
  }

  function commit(next: number) {
    if (next === lastHaptic.current) return;
    lastHaptic.current = next;
    void Haptics.selectionAsync();
    onChange(next);
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text
          style={{
            fontSize: 44,
            fontWeight: '600',
            letterSpacing: -1,
            color: value === null ? theme.faint : theme.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value === null ? '–' : value}
        </Text>
        <Text style={[t.label, { color: theme.muted }]}>
          {value === null ? 'Not set' : SCALE_ANCHORS[value]}
        </Text>
      </View>

      <View
        ref={containerRef}
        onLayout={(e: LayoutChangeEvent) => {
          setWidth(e.nativeEvent.layout.width);
          // Measured after layout settles, so the row's on-screen X is known
          // before any touch needs it. Only the horizontal position matters
          // here, and scrolling this screen vertically doesn't change it, so
          // one measurement per layout is enough — no need to re-measure per
          // touch.
          containerRef.current?.measure((_x, _y, _w, _h, pageX) => {
            containerPageX.current = pageX;
          });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // `locationX` is relative to whichever child segment the touch first
        // lands on, not to this row — so tapping segment "7" directly reports
        // an X of a few pixels (relative to that one narrow segment) rather
        // than its true position along the full row, and resolves to the
        // wrong value. `pageX` is an absolute screen coordinate with no such
        // ambiguity; subtracting the row's own screen position converts it
        // to the same 0..width space `valueAtX` expects.
        onResponderGrant={(e) => commit(valueAtX(e.nativeEvent.pageX - containerPageX.current))}
        onResponderMove={(e) => commit(valueAtX(e.nativeEvent.pageX - containerPageX.current))}
        onResponderRelease={() => {
          lastHaptic.current = null;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Severity rating"
        accessibilityValue={{
          min: SCALE_MIN,
          max: SCALE_MAX,
          now: value ?? undefined,
          text: value === null ? 'Not set' : `${value} out of 10, ${SCALE_ANCHORS[value]}`,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const current = value ?? SCALE_MIN;
          if (event.nativeEvent.actionName === 'increment') {
            onChange(Math.min(SCALE_MAX, current + 1));
          } else if (event.nativeEvent.actionName === 'decrement') {
            onChange(Math.max(SCALE_MIN, current - 1));
          }
        }}
        style={{ flexDirection: 'row', gap: GAP, height: 52 }}
      >
        {VALUES.map((v) => {
          const selected = value === v;
          // Alpha on the fill, not opacity on the view: opacity would fade the
          // numeral too, and the numeral is what makes the scale readable
          // without relying on colour.
          const fill = ratingColorAlpha(v, selected ? 1 : value === null ? 0.3 : 0.18);
          return (
            <View
              key={v}
              style={{
                flex: 1,
                borderRadius: radius.md,
                backgroundColor: fill,
                borderWidth: selected ? 2 : 0,
                borderColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  ...t.meta,
                  fontWeight: selected ? '700' : '500',
                  color: selected ? contrastTextOn(v) : theme.ink,
                }}
              >
                {v}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[t.meta, { color: theme.muted }]}>{SCALE_ANCHORS[SCALE_MIN]}</Text>
        <Text style={[t.meta, { color: theme.muted }]}>{SCALE_ANCHORS[SCALE_MAX]}</Text>
      </View>
    </View>
  );
}

/** Yes / No, used for the two daily impact questions. */
export function YesNo({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {[
        { label: 'No', v: false },
        { label: 'Yes', v: true },
      ].map((option) => {
        const active = value === option.v;
        return (
          <Pressable
            key={option.label}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(option.v);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.lg,
              backgroundColor: active ? theme.accent : theme.card,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: active ? theme.accent : theme.line,
            }}
          >
            <Text
              style={[t.body, { color: active ? theme.accentContrast : theme.ink, fontWeight: '600' }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
