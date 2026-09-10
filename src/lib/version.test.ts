import { describe, expect, it } from 'vitest';
import { compareVersions, isOlderThan } from './version';

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    // "1.764.6" sorts after "1.824.7" as a string; numerically it is older.
    expect(compareVersions('1.764.6', '1.824.7')).toBe(-1);
    expect(compareVersions('1.824.7', '1.764.6')).toBe(1);
    expect(compareVersions('1.824.7', '1.824.7')).toBe(0);
  });

  it('orders on major, then minor, then patch', () => {
    expect(compareVersions('2.0.0', '1.999.999')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.9.10', '1.9.9')).toBe(1);
  });

  it('tolerates a leading v, whitespace and missing parts', () => {
    expect(compareVersions('v1.824.7', '1.824.7')).toBe(0);
    expect(compareVersions(' 1.824', '1.824.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });

  it('ignores pre-release and build suffixes', () => {
    expect(compareVersions('1.824.7-rc1', '1.824.7')).toBe(0);
    expect(compareVersions('1.824.7+build.3', '1.824.8')).toBe(-1);
  });

  it('returns null when either side cannot be parsed', () => {
    expect(compareVersions('unknown', '1.824.7')).toBeNull();
    expect(compareVersions('1.824.7', '')).toBeNull();
    expect(compareVersions(null, '1.824.7')).toBeNull();
    expect(compareVersions('1.824.7', null)).toBeNull();
  });
});

describe('isOlderThan', () => {
  it('is true only when both parse and the candidate is strictly older', () => {
    expect(isOlderThan('1.764.6', '1.824.7')).toBe(true);
    expect(isOlderThan('1.824.7', '1.824.7')).toBe(false);
    expect(isOlderThan('1.900.0', '1.824.7')).toBe(false);
  });

  it('is false, never true, for an unparseable version', () => {
    expect(isOlderThan('unknown', '1.824.7')).toBe(false);
    expect(isOlderThan(null, '1.824.7')).toBe(false);
  });
});
