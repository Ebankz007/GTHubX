/**
 * Pure aggregation helpers for the admin reports page.
 *
 * Kept out of the page component so the logic is testable — a server component
 * is unreachable from Vitest, and the interesting failure (a day with no
 * signups disappearing from the chart instead of rendering as zero) is exactly
 * the kind of thing that only shows up visually.
 */

export const DAY_MS = 86_400_000;

/** UTC calendar-day key, used for both the bucket label and the lookup. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type SeriesPoint = { label: string; count: number };

/**
 * Turn a list of timestamps into a fixed-length daily series.
 *
 * Fixed length, not "only the days that appear": a day with no activity must
 * render as zero, otherwise a gap reads as "the data ends here" and a quiet
 * day becomes indistinguishable from missing data.
 *
 * `now` is injectable so tests are deterministic.
 */
export function dailySeries(
  dates: readonly Date[],
  days: number,
  now: Date = new Date(),
): SeriesPoint[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const k = dayKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * DAY_MS));
    out.push({ label: k.slice(5), count: counts.get(k) ?? 0 });
  }
  return out;
}
