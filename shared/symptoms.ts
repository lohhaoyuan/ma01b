// The tracked symptom domains, their weights, and the severity colour ramp.
//
// CANONICAL SOURCE. Do not edit the copies under mobile/src/shared or
// web/src/shared — run `npm run sync:shared` from the repo root instead.
//
// The weights here MUST match the generated `severity` column in
// supabase/migrations/0001_init.sql. The database is authoritative: neither app
// computes severity itself. The weights are duplicated here only so the UI can
// explain how the score is composed and order the domains by clinical weight.

export type DomainKey =
  | 'pelvic_pain'
  | 'menstrual_pain'
  | 'lower_back_pain'
  | 'bowel_pain'
  | 'urination_pain'
  | 'sex_pain'
  | 'fatigue'
  | 'bloating';

export interface Domain {
  key: DomainKey;
  label: string;
  /** Shown above the scale during logging. */
  question: string;
  weight: number;
  /** Whether the patient can mark the domain as not applicable today. */
  allowNotApplicable: boolean;
}

/** Logging order: the two most heavily weighted domains first. */
export const DOMAINS: Domain[] = [
  {
    key: 'pelvic_pain',
    label: 'Pelvic pain',
    question: 'On average, how bad was your pelvic pain today?',
    weight: 3.0,
    allowNotApplicable: false,
  },
  {
    key: 'menstrual_pain',
    label: 'Menstrual pain',
    question: 'How bad was your menstrual pain today?',
    weight: 2.5,
    allowNotApplicable: true,
  },
  {
    key: 'lower_back_pain',
    label: 'Lower back pain',
    question: 'How bad was your lower back pain today?',
    weight: 1.5,
    allowNotApplicable: false,
  },
  {
    key: 'bowel_pain',
    label: 'Pain during bowel movements',
    question: 'How much pain did you have during bowel movements today?',
    weight: 1.5,
    allowNotApplicable: true,
  },
  {
    key: 'urination_pain',
    label: 'Pain during urination',
    question: 'How much pain did you have during urination today?',
    weight: 1.5,
    allowNotApplicable: false,
  },
  {
    key: 'sex_pain',
    label: 'Pain during sex',
    question: 'How much pain did you have during sex today?',
    weight: 1.5,
    allowNotApplicable: true,
  },
  {
    key: 'fatigue',
    label: 'Fatigue',
    question: 'How fatigued did you feel today?',
    weight: 1.5,
    allowNotApplicable: false,
  },
  {
    key: 'bloating',
    label: 'Bloating',
    question: 'How bloated did you feel today?',
    weight: 1.0,
    allowNotApplicable: false,
  },
];

/** Verbal anchors for the numeric rating scale. */
export const SCALE_ANCHORS: Record<number, string> = {
  0: 'None',
  1: 'Barely noticeable',
  2: 'Mild',
  3: 'Mild',
  4: 'Uncomfortable',
  5: 'Moderate',
  6: 'Distracting',
  7: 'Severe',
  8: 'Severe',
  9: 'Very severe',
  10: 'Worst imaginable',
};

export const SCALE_MIN = 0;
export const SCALE_MAX = 10;

/** Matches elevated_threshold() in the migration. */
export const ELEVATED_THRESHOLD = 60;

/** Consecutive elevated days before the app suggests seeing a doctor. */
export const STREAK_DAYS_FOR_ALERT = 7;

// --- Severity colour ramp ---------------------------------------------------
//
// Blue (low) through a desaturated neutral mid to red (high). Red/blue is
// legible under both deuteranopia and protanopia, unlike red/green. The ramp is
// never the only encoding: the numeral is always shown alongside it.
//
// This is data-only. The pink accent is interaction-only. Mixing the two makes
// the scale untrustworthy, because a pink control starts reading as a value.

const RAMP_STOPS: Array<[number, [number, number, number]]> = [
  [0, [59, 130, 246]], // #3B82F6
  [3, [100, 181, 196]], // #64B5C4
  [5, [163, 163, 163]], // #A3A3A3
  [7, [240, 168, 104]], // #F0A868
  [10, [220, 38, 38]], // #DC2626
];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** RGB components for a 0-10 rating. */
export function ratingRgb(rating: number): [number, number, number] {
  const v = Math.max(SCALE_MIN, Math.min(SCALE_MAX, rating));
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    const [lowV, lowC] = RAMP_STOPS[i];
    const [highV, highC] = RAMP_STOPS[i + 1];
    if (v >= lowV && v <= highV) {
      const t = highV === lowV ? 0 : (v - lowV) / (highV - lowV);
      return [lerp(lowC[0], highC[0], t), lerp(lowC[1], highC[1], t), lerp(lowC[2], highC[2], t)];
    }
  }
  return RAMP_STOPS[0][1];
}

/** Colour for a 0-10 rating. */
export function ratingColor(rating: number): string {
  return `rgb(${ratingRgb(rating).join(', ')})`;
}

/**
 * The same colour at reduced strength.
 *
 * Dimming a swatch has to be done with alpha on the fill, never with opacity on
 * a container — opacity fades the label with the background, and the numeral is
 * the part that has to stay readable when the colour cannot be told apart.
 */
export function ratingColorAlpha(rating: number, alpha: number): string {
  return `rgba(${ratingRgb(rating).join(', ')}, ${alpha})`;
}

/**
 * Black or white, whichever is readable on this rating's fill.
 *
 * The ramp passes through a light orange around 7, where white text falls below
 * usable contrast — so the text colour has to follow the fill's luminance
 * rather than being fixed.
 */
export function contrastTextOn(rating: number): string {
  const [r, g, b] = ratingRgb(rating);
  // Rec. 709 relative luminance, good enough to choose between two extremes.
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#18181B' : '#FFFFFF';
}

/** Colour for a 0-100 composite severity, reusing the same ramp. */
export function severityColor(severity: number): string {
  return ratingColor((Math.max(0, Math.min(100, severity)) / 100) * SCALE_MAX);
}

/** Plain-language band for a composite severity. Always shown with the number. */
export function severityBand(severity: number): string {
  if (severity >= 80) return 'Very high';
  if (severity >= ELEVATED_THRESHOLD) return 'Elevated';
  if (severity >= 40) return 'Moderate';
  if (severity >= 20) return 'Mild';
  return 'Low';
}
