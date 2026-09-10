import { describe, expect, it } from 'vitest';
import {
  cleanLabel,
  fmtCount,
  fmtCurrency,
  fmtCurrencyCents,
  fmtCurrencyCompact,
  fmtMonthly,
  fmtPercent,
  formatCountyName,
} from './format';

describe('currency formatting', () => {
  it('rounds to whole dollars with a thousands separator', () => {
    expect(fmtCurrency(1949.4)).toBe('$1,949');
    expect(fmtCurrency(1949.5)).toBe('$1,950');
    expect(fmtCurrency(0)).toBe('$0');
    expect(fmtCurrency(-5)).toBe('-$5');
  });

  it('keeps cents when asked', () => {
    expect(fmtCurrencyCents(12.5)).toBe('$12.50');
  });

  it('appends the monthly suffix', () => {
    expect(fmtMonthly(1500)).toBe('$1,500/mo');
  });
});

describe('fmtCurrencyCompact', () => {
  it('uses billions with one decimal below $10B and none above', () => {
    expect(fmtCurrencyCompact(9_973_323_424)).toBe('$10.0B');
    expect(fmtCurrencyCompact(151_456_497_923)).toBe('$151B');
    expect(fmtCurrencyCompact(1_300_000_000)).toBe('$1.3B');
  });

  it('uses millions with one decimal below $10M and none above', () => {
    expect(fmtCurrencyCompact(5_900_000)).toBe('$5.9M');
    expect(fmtCurrencyCompact(749_000_000)).toBe('$749M');
  });

  it('uses thousands from $10k and plain dollars below', () => {
    expect(fmtCurrencyCompact(73_000)).toBe('$73k');
    expect(fmtCurrencyCompact(10_000)).toBe('$10k');
    expect(fmtCurrencyCompact(9_999)).toBe('$9,999');
    expect(fmtCurrencyCompact(0)).toBe('$0');
  });

  it('keeps the sign in front of the symbol', () => {
    expect(fmtCurrencyCompact(-2_000_000_000)).toBe('-$2.0B');
    expect(fmtCurrencyCompact(-15_000)).toBe('-$15k');
  });
});

describe('fmtPercent and fmtCount', () => {
  it('formats a ratio as a percentage', () => {
    expect(fmtPercent(0.144)).toBe('14.4%');
    expect(fmtPercent(1.1, 0)).toBe('110%');
    expect(fmtPercent(0)).toBe('0.0%');
  });

  it('rounds counts to whole numbers', () => {
    expect(fmtCount(16_853_856.45)).toBe('16,853,856');
    expect(fmtCount(0.4)).toBe('0');
  });
});

describe('cleanLabel', () => {
  it('drops a leading state name and program acronym, then sentence-cases', () => {
    expect(cleanLabel('Illinois CCAP copay', 'Illinois')).toBe('Copay');
    expect(cleanLabel('Maryland CCS weekly copayment', 'Maryland')).toBe('Weekly copayment');
  });

  it('drops up to two acronyms, with or without parentheses', () => {
    expect(cleanLabel('(CCAP) income limit')).toBe('Income limit');
    expect(cleanLabel('CDC C4K rate')).toBe('Rate');
    expect(cleanLabel('A1 B2 C3 rate')).toBe('C3 rate');
  });

  it('leaves ordinary words alone and falls back to the label when nothing remains', () => {
    expect(cleanLabel('weekly copay')).toBe('Weekly copay');
    expect(cleanLabel('CCAP')).toBe('CCAP');
    expect(cleanLabel('')).toBe('');
  });
});

describe('formatCountyName', () => {
  it('title-cases the enum and appends the state code', () => {
    expect(formatCountyName('LOS_ANGELES_COUNTY_CA')).toBe('Los Angeles County, CA');
    expect(formatCountyName('EAST_BATON_ROUGE_PARISH_LA')).toBe('East Baton Rouge Parish, LA');
    expect(formatCountyName('ANCHORAGE_MUNICIPALITY_AK')).toBe('Anchorage Municipality, AK');
  });

  it('keeps interior "of" lower case and gives DC no suffix', () => {
    expect(formatCountyName('DISTRICT_OF_COLUMBIA_DC')).toBe('District of Columbia');
  });

  it('applies the hand-written overrides', () => {
    expect(formatCountyName('MIAMI_DADE_COUNTY_FL')).toBe('Miami-Dade County, FL');
    expect(formatCountyName('ST_LOUIS_COUNTY_MO')).toBe('St. Louis County, MO');
  });

  it('handles empty and single-token input', () => {
    expect(formatCountyName('')).toBe('');
    expect(formatCountyName('STATEWIDE')).toBe('STATEWIDE');
  });
});
