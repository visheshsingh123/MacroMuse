import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../public/weekly-insights.js', import.meta.url), 'utf8'), context);
const compare = context.window.NutriWeekly.compareWeeks;

test('midweek comparison uses matching weekdays and excludes missing, future and older days', () => {
  const data = {
    '2026-10-12': { kcal: 2000, protein: 100 }, '2026-10-13': { water: 3 }, '2026-10-14': { kcal: 2200, protein: 120 },
    '2026-10-05': { kcal: 1800, protein: 90 }, '2026-10-06': { kcal: '2000' }, '2026-10-07': { kcal: 2000, protein: 110 },
    '2026-10-08': { kcal: 9000 }, '2026-10-15': { kcal: 9000 }, '2026-10-04': { kcal: 9000 },
  };
  const result = compare(data, 2000, new Date(2026, 9, 14, 15));
  assert.equal(result.elapsedDays, 3);
  assert.equal(result.current.start, '2026-10-12'); assert.equal(result.current.end, '2026-10-14');
  assert.equal(result.previous.start, '2026-10-05'); assert.equal(result.previous.end, '2026-10-07');
  assert.equal(result.current.daysLogged, 2); assert.equal(result.previous.daysLogged, 2);
  assert.equal(result.current.averageKcal, 2100); assert.equal(result.previous.averageKcal, 1900);
  assert.equal(result.current.averageProtein, 110); assert.equal(result.previous.averageProtein, 100);
  assert.equal(result.current.goalRate, 100); assert.equal(result.previous.goalRate, 100);
});

test('empty and first-week data stay distinct from explicit zero-value entries', () => {
  const monday = new Date(2026, 9, 19);
  const empty = compare({}, 2000, monday);
  assert.equal(empty.elapsedDays, 1);
  for (const week of [empty.current, empty.previous]) {
    assert.equal(week.daysLogged, 0); assert.equal(week.averageKcal, null); assert.equal(week.averageProtein, null); assert.equal(week.goalRate, null);
  }
  const first = compare({ '2026-10-19': { kcal: 0, protein: 0 } }, 2000, monday);
  assert.equal(first.current.daysLogged, 1); assert.equal(first.current.averageKcal, 0); assert.equal(first.current.averageProtein, 0);
  assert.equal(first.current.goalRate, 0); assert.equal(first.previous.averageKcal, null);
});

test('missing protein and invalid goals do not create invented averages or rates', () => {
  const data = { '2026-10-12': { kcal: 2000 }, '2026-10-13': { kcal: 2200, protein: 100 } };
  const result = compare(data, 0, new Date(2026, 9, 14));
  assert.equal(result.current.averageProtein, 100); assert.equal(result.current.goalRate, null);
  assert.equal(compare(data, 1000, new Date(2026, 9, 14)).current.goalRate, 0);
  assert.equal(compare({ '2026-10-12': { kcal: Infinity }, '2026-10-13': { kcal: -1 } }, 2000, new Date(2026, 9, 14)).current.daysLogged, 0);
});

test('Sunday, year boundaries and daylight-saving changes use calendar dates', () => {
  const sunday = compare({}, 2000, new Date(2026, 9, 18));
  assert.equal(sunday.elapsedDays, 7); assert.equal(sunday.previous.end, '2026-10-11');
  const year = compare({}, 2000, new Date(2026, 0, 1));
  assert.equal(year.current.start, '2025-12-29'); assert.equal(year.previous.end, '2025-12-25');
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const dst = compare({}, 2000, new Date(2026, 2, 11, 1));
    assert.equal(dst.current.start, '2026-03-09'); assert.equal(dst.previous.start, '2026-03-02'); assert.equal(dst.previous.end, '2026-03-04');
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
