import { afterEach, describe, expect, it, vi } from 'vitest';
import { pauseHouseholdCalculations } from './api';
import { watchHouseholdCalculationPause } from './useHouseholdCalculationPause';

afterEach(() => {
  // Real time first, so that ending the pause ends it in real time.
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

describe('watchHouseholdCalculationPause', () => {
  it('reports a pause that ended before it started watching as over, and keeps no interval', () => {
    // For example, the reader returns to the Calculator tab in a pause's
    // last moments: the page rendered with 1 s left, and the pause has
    // ended by the time the countdown starts watching.
    vi.useFakeTimers();
    pauseHouseholdCalculations(1000, 'Refused for the limit.');
    vi.advanceTimersByTime(1000);
    const report = vi.fn();

    const stopWatching = watchHouseholdCalculationPause(report);

    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ secondsRemaining: 0 }));
    expect(vi.getTimerCount()).toBe(0);
    stopWatching();
  });

  it('counts a pause down once a second and stops its interval when the pause ends', () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const stopWatching = watchHouseholdCalculationPause(report);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ secondsRemaining: 0 }));

    pauseHouseholdCalculations(3000, 'Refused for the limit.');
    expect(report).toHaveBeenLastCalledWith({ secondsRemaining: 3, reason: 'Refused for the limit.' });

    vi.advanceTimersByTime(1000);
    expect(report).toHaveBeenLastCalledWith({ secondsRemaining: 2, reason: 'Refused for the limit.' });
    vi.advanceTimersByTime(1000);
    expect(report).toHaveBeenLastCalledWith({ secondsRemaining: 1, reason: 'Refused for the limit.' });
    vi.advanceTimersByTime(1000);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ secondsRemaining: 0 }));
    expect(vi.getTimerCount()).toBe(0);
    stopWatching();
  });

  it('ends the countdown when a pause is ended early, and reports nothing once it stops watching', () => {
    vi.useFakeTimers();
    pauseHouseholdCalculations(60_000, 'Refused for the limit.');
    const report = vi.fn();
    const stopWatching = watchHouseholdCalculationPause(report);
    expect(report).toHaveBeenLastCalledWith({ secondsRemaining: 60, reason: 'Refused for the limit.' });
    expect(vi.getTimerCount()).toBe(1);

    pauseHouseholdCalculations(0);
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ secondsRemaining: 0 }));
    expect(vi.getTimerCount()).toBe(0);

    pauseHouseholdCalculations(60_000, 'Refused for the limit.');
    stopWatching();
    const reportsBeforeStopping = report.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    pauseHouseholdCalculations(0);
    expect(report).toHaveBeenCalledTimes(reportsBeforeStopping);
  });
});
