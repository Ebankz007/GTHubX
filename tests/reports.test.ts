import { describe, expect, it } from "vitest";
import { dailySeries, dayKey, DAY_MS } from "@/lib/reports";

/** A fixed instant so every expectation is deterministic. */
const NOW = new Date("2026-01-31T12:00:00.000Z");
const at = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY_MS);

describe("dayKey", () => {
  it("formats as YYYY-MM-DD in UTC", () => {
    expect(dayKey(new Date("2026-01-31T23:59:59.999Z"))).toBe("2026-01-31");
  });

  it("rolls over at UTC midnight, not local midnight", () => {
    // 2026-02-01 00:30 UTC is still 2026-01-31 in most Americas timezones,
    // but the series must use one consistent calendar regardless of where the
    // server happens to sit.
    expect(dayKey(new Date("2026-02-01T00:30:00.000Z"))).toBe("2026-02-01");
  });
});

describe("dailySeries", () => {
  it("always returns exactly `days` buckets", () => {
    expect(dailySeries([], 7, NOW)).toHaveLength(7);
    expect(dailySeries([], 30, NOW)).toHaveLength(30);
    expect(dailySeries([], 90, NOW)).toHaveLength(90);
  });

  it("renders a day with no activity as zero rather than omitting it", () => {
    // Two events today, one two days ago — nothing at all yesterday.
    // Series runs oldest -> newest, so: [2d ago, 1d ago, today] = [1, 0, 2].
    const points = dailySeries([at(0), at(0), at(2)], 3, NOW);

    expect(points).toHaveLength(3);
    expect(points.map((p) => p.count)).toEqual([1, 0, 2]);
    expect(points[1].count).toBe(0);
  });

  it("ends on `now`'s day and works backwards", () => {
    const points = dailySeries([], 3, NOW);

    expect(points[points.length - 1].label).toBe("01-31");
    expect(points[0].label).toBe("01-29");
  });

  it("counts multiple events on the same day together", () => {
    const points = dailySeries([at(0), at(0), at(0)], 2, NOW);

    expect(points[1].count).toBe(3);
    expect(points[0].count).toBe(0);
  });

  it("ignores timestamps outside the requested window", () => {
    const points = dailySeries([at(0), at(10)], 3, NOW);

    expect(points).toHaveLength(3);
    expect(points.reduce((a, p) => a + p.count, 0)).toBe(1);
  });

  it("a single day range yields just today", () => {
    const points = dailySeries([at(0)], 1, NOW);

    expect(points).toEqual([{ label: "01-31", count: 1 }]);
  });
});
