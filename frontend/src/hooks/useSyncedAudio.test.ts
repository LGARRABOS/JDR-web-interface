import { expect, test } from 'vitest';
import { parseTime, formatTime } from './useSyncedAudio';
test('parseTime', () => {
  expect(parseTime('1:30')).toBe(90);
  expect(parseTime('90')).toBe(90);
  expect(parseTime('2m15')).toBe(135);
  expect(parseTime('1:02:03')).toBe(3723);
  expect(parseTime('abc')).toBeNull();
  expect(parseTime('')).toBeNull();
  expect(formatTime(3723)).toBe('1:02:03');
  expect(formatTime(75)).toBe('1:15');
});
