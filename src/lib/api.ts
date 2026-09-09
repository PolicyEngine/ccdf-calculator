/**
 * Live household calculations against the v1 PolicyEngine API.
 *
 * The API runs whatever policyengine-us version is deployed, which lags the
 * version the precomputed grid was built with, and some state programs are not
 * in it yet. `fetchApiMetadata` gives us the deployed version and the set of
 * variables that exist, so the UI can gate the "calculate exactly" button.
 */

import { buildSituation, type HouseholdSpec } from './situation';
import type { StateInputConfig } from './types';

const API_BASE = 'https://api.policyengine.org/us';
const CACHE_KEY = 'ccdf-calculator:us-api-metadata';

export interface ApiMetadata {
  version: string;
  /** Names of every variable in the deployed model. */
  variables: Set<string>;
}

interface CachedMetadata {
  version: string;
  variables: string[];
}

let inFlight: Promise<ApiMetadata> | null = null;
let memory: ApiMetadata | null = null;

function readSessionCache(): ApiMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMetadata;
    if (!parsed?.version || !Array.isArray(parsed.variables)) return null;
    return { version: parsed.version, variables: new Set(parsed.variables) };
  } catch {
    return null;
  }
}

function writeSessionCache(metadata: ApiMetadata): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedMetadata = {
      version: metadata.version,
      variables: Array.from(metadata.variables),
    };
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable; the in-memory cache still applies.
  }
}

/**
 * Fetch the model metadata once per session. The payload is several megabytes,
 * so only the version and the variable names are kept.
 */
export function fetchApiMetadata(): Promise<ApiMetadata> {
  if (memory) return Promise.resolve(memory);
  const cached = readSessionCache();
  if (cached) {
    memory = cached;
    return Promise.resolve(cached);
  }
  if (inFlight) return inFlight;

  inFlight = fetch(`${API_BASE}/metadata`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`The PolicyEngine API returned ${res.status}.`);
      const body = (await res.json()) as {
        result?: { version?: string; variables?: Record<string, unknown> };
      };
      const version = body.result?.version ?? 'unknown';
      const variables = new Set(Object.keys(body.result?.variables ?? {}));
      const metadata: ApiMetadata = { version, variables };
      memory = metadata;
      writeSessionCache(metadata);
      return metadata;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Variables this state needs that the deployed model does not have. */
export function missingVariables(
  config: StateInputConfig,
  metadata: ApiMetadata,
): string[] {
  const required = [config.main, config.copay];
  if (config.eligible) required.push(config.eligible);
  return required.filter((name) => !metadata.variables.has(name));
}

export interface LiveResult {
  subsidy: number;
  copay: number;
  outOfPocket: number;
  eligible: boolean;
  fpg: number;
  smi: number;
  childCareSubsidies: number;
  version: string;
}

type YearValues = Record<string, number | boolean | string | null>;
type EntityResult = Record<string, YearValues>;

interface CalculateResponse {
  status?: string;
  message?: string;
  result?: Record<string, Record<string, EntityResult>> | null;
}

/** Sum a variable across every entity of every group it appears in. */
function readTotal(
  result: NonNullable<CalculateResponse['result']>,
  variable: string,
  year: string,
): number {
  let total = 0;
  let found = false;
  Object.values(result).forEach((group) => {
    Object.values(group).forEach((entity) => {
      const values = entity?.[variable];
      if (values && values[year] !== undefined && values[year] !== null) {
        total += Number(values[year]);
        found = true;
      }
    });
  });
  return found ? total : 0;
}

function readFirst(
  result: NonNullable<CalculateResponse['result']>,
  variable: string,
  year: string,
): number | boolean | string | null {
  let value: number | boolean | string | null = null;
  Object.values(result).forEach((group) => {
    Object.values(group).forEach((entity) => {
      const values = entity?.[variable];
      if (value === null && values && values[year] !== undefined) {
        value = values[year];
      }
    });
  });
  return value;
}

export interface CalculateOptions {
  config: StateInputConfig;
  household: HouseholdSpec;
  year: number;
  metadata: ApiMetadata;
  signal?: AbortSignal;
}

/**
 * Post the household to the API and convert the annual result to the monthly
 * figures the UI shows, per docs/DATA_CONTRACT.md.
 */
export async function calculateLive({
  config,
  household,
  year,
  metadata,
  signal,
}: CalculateOptions): Promise<LiveResult> {
  const missing = missingVariables(config, metadata);
  if (missing.length > 0) {
    throw new Error(
      `The live API runs policyengine-us ${metadata.version}, which does not include ${missing.join(', ')}.`,
    );
  }
  const situation = buildSituation(config, household, year, metadata.variables);
  const response = await fetch(`${API_BASE}/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ household: situation }),
    signal,
  });

  let body: CalculateResponse;
  try {
    body = (await response.json()) as CalculateResponse;
  } catch {
    throw new Error(`The PolicyEngine API returned ${response.status}.`);
  }
  if (body.status !== 'ok' || !body.result) {
    throw new Error(body.message || 'The PolicyEngine API could not compute this household.');
  }

  const year_ = String(year);
  const result = body.result;
  const subsidy = readTotal(result, config.main, year_) / 12;
  const factor =
    config.copay_factor === 'days' ? household.attendingDaysPerMonth : config.copay_factor;
  const copay = (readTotal(result, config.copay, year_) / 12) * factor;
  const childCareSubsidies = readTotal(result, 'child_care_subsidies', year_) / 12;
  const eligibleRaw = config.eligible ? readFirst(result, config.eligible, year_) : null;
  const eligible = config.eligible ? Boolean(eligibleRaw) : subsidy > 0;
  const charge = household.monthlyChargePerChild * household.childAges.length;

  return {
    subsidy,
    copay,
    outOfPocket: Math.max(0, charge - subsidy),
    eligible,
    fpg: readTotal(result, 'spm_unit_fpg', year_),
    smi: readTotal(result, 'hhs_smi', year_),
    childCareSubsidies,
    version: metadata.version,
  };
}
