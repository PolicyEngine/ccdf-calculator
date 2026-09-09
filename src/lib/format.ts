/**
 * The single place user-visible numbers get formatted. Every chart axis,
 * tooltip, metric and sentence in the app goes through one of these.
 */

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const CURRENCY_CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `$1,234` — sign before symbol, courtesy of Intl. */
export function fmtCurrency(value: number): string {
  return CURRENCY.format(value);
}

export function fmtCurrencyCents(value: number): string {
  return CURRENCY_CENTS.format(value);
}

/** `$1.2B` / `$340M` / `$12k` — for axes and headline tiles. */
export function fmtCurrencyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e4) return `${sign}$${Math.round(abs / 1e3)}k`;
  return CURRENCY.format(value);
}

/** `14.4%` from a ratio (0.144). */
export function fmtPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function fmtCount(value: number): string {
  return COUNT.format(value);
}

export function fmtMonthly(value: number): string {
  return `${fmtCurrency(value)}/mo`;
}

/** Sentence-case a label and drop a leading state name and program acronym. */
export function cleanLabel(label: string, stateName?: string): string {
  let text = (label || '').trim();
  if (stateName && text.toLowerCase().startsWith(stateName.toLowerCase())) {
    text = text.slice(stateName.length).trim();
  }
  // Drop up to two leading program acronyms, e.g. "CCAP", "CDC", "C4K".
  for (let i = 0; i < 2; i += 1) {
    const stripped = text.replace(/^\(?[A-Z][A-Z0-9]{1,6}\)?\s+/, '');
    if (stripped === text) break;
    text = stripped;
  }
  if (!text) text = label;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Turn a `county` enum value into prose: `LOS_ANGELES_COUNTY_CA` reads as
 * "Los Angeles County, CA" and `EAST_BATON_ROUGE_PARISH_LA` as
 * "East Baton Rouge Parish, LA". The final token is always the state code.
 * The District of Columbia is its own state, so it takes no state suffix.
 */
// County enum names that title-casing alone gets wrong.
const COUNTY_NAME_OVERRIDES: Record<string, string> = {
  MIAMI_DADE_COUNTY_FL: 'Miami-Dade County, FL',
  ST_LOUIS_COUNTY_MO: 'St. Louis County, MO',
  ST_LOUIS_CITY_MO: 'St. Louis City, MO',
};

export function formatCountyName(county: string): string {
  if (county in COUNTY_NAME_OVERRIDES) return COUNTY_NAME_OVERRIDES[county];
  const tokens = (county || '').split('_').filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];

  const stateCode = tokens[tokens.length - 1].toUpperCase();
  const name = tokens
    .slice(0, -1)
    .map((token, index) => {
      const lower = token.toLowerCase();
      // Interior joining words stay lower case: "District of Columbia".
      if (index > 0 && lower === 'of') return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');

  if (stateCode === 'DC') return name;
  return `${name}, ${stateCode}`;
}
