/**
 * Live household calculations through www.policyengine.org's dashboard API,
 * which forwards them to the PolicyEngine Public API with PolicyEngine's
 * credential.
 *
 * The Public API runs whatever policyengine-us version is deployed, which lags
 * the version the precomputed grid was built with, and some state programs are
 * not in it yet. `fetchApiMetadata` gives us the deployed version and the set of
 * variables that exist, so the UI can gate the "calculate exactly" button.
 *
 * www.policyengine.org's firewall allows each IP address 30 household
 * calculations a minute. After a refusal for that limit, the page sends no
 * calculation for a minute (see `pauseHouseholdCalculations`).
 */

import {
  createPolicyEngineApiClient,
  DEFAULT_BASE_URL,
  PolicyEngineApiError,
  RATE_LIMIT_WAIT_MILLISECONDS,
} from '@policyengine/api-client';

import { outOfPocketCost } from './dataLookup';
import { buildSituation, type HouseholdSpec } from './situation';
import type { StateInputConfig } from './types';

const policyengine = createPolicyEngineApiClient();
const CACHE_KEY = 'ccdf-calculator:us-api-metadata';

/**
 * What the page says about the firewall's limit, which everyone behind one
 * IP address shares. Callers add the final full stop.
 */
export const SHARED_LIMIT_EXPLANATION =
  'Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute';

/**
 * The message of a calculation held back during a pause, and the reason of a
 * pause started without one. The pause may have started from a request with
 * no answer, which only may have met the limit.
 */
const HELD_BACK_MESSAGE = `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`;

/**
 * When the page may send household calculations again after a refusal for
 * the firewall's limit, in `Date.now()` milliseconds. `calculateLive` checks
 * it before sending.
 */
let householdCalculationsPausedUntil = 0;
/** The user-facing message of the failure that started the pause. */
let pauseReason = HELD_BACK_MESSAGE;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (the firewall's minute unless given); 0 ends a pause. `reason` is the
 * user-facing message of the failure that started it; without one, it is
 * the message of a calculation held back during a pause, which also
 * replaces the previous pause's reason when a pause is ended with 0.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_WAIT_MILLISECONDS,
  reason: string = HELD_BACK_MESSAGE,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseReason = reason;
  pauseListeners.forEach((listener) => listener());
}

/**
 * The user-facing message of the failure that started the current or last
 * pause, or the held-back message after a pause started or ended without one.
 */
export function householdCalculationPauseReason(): string {
  return pauseReason;
}

/** Milliseconds until the page may send household calculations again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/** Whole seconds until the page may send household calculations again, rounded up. */
export function householdCalculationPauseSeconds(): number {
  return Math.ceil(householdCalculationPauseRemaining() / 1000);
}

/** Calls `listener` whenever a pause starts or is ended early; returns the unsubscribe. */
export function onHouseholdCalculationPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

/** The label of the button that sends the exact calculation. */
export function calculateButtonLabel(calculating: boolean, pauseSeconds: number): string {
  if (pauseSeconds > 0) return `Calculate again in ${pauseSeconds} s`;
  return calculating ? 'Calculating…' : 'Calculate exactly';
}

/** The sentence after the pause's reason in the notice shown during a pause. */
export function calculationPauseCountdown(pauseSeconds: number): string {
  return `This page can calculate again in ${pauseSeconds} s.`;
}

/** A live calculation failed; `message` is written for the user. */
export class LiveCalculationError extends Error {
  override name = 'LiveCalculationError';

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /**
     * Whether the firewall's limit refused it or may have: a 429, no answer
     * on another origin (which is how such a page sees a 429), or a
     * calculation held back during the pause after a refusal.
     */
    readonly rateLimited: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * Whether the page is served from the dashboard API's own origin
 * (www.policyengine.org), where the firewall's 429 is readable.
 */
function pageSharesDashboardApiOrigin(): boolean {
  return globalThis.location?.origin === new URL(DEFAULT_BASE_URL).origin;
}

/** Turns a failure of the dashboard API client into a message for the user. */
function calculationError(error: PolicyEngineApiError): LiveCalculationError {
  if (error.status === 429) {
    return new LiveCalculationError(`${SHARED_LIMIT_EXPLANATION}, and it has been reached.`, 429, true, {
      cause: error,
    });
  }
  if (error.status === null) {
    if (pageSharesDashboardApiOrigin()) {
      // The firewall's 429 would be readable here, so this is a network failure.
      return new LiveCalculationError(
        "PolicyEngine's calculation service could not be reached. Check your connection and try again.",
        null,
        false,
        { cause: error },
      );
    }
    // On another origin, such as localhost, the firewall's 429 has no CORS
    // headers, so the browser reports a network failure. So does the
    // dashboard API's 403 for an origin it does not allow.
    return new LiveCalculationError(
      `PolicyEngine's calculation service could not be reached. ${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
      null,
      true,
      { cause: error },
    );
  }
  // The dashboard API's or the Public API's own message, or the HTTP status.
  return new LiveCalculationError(error.message, error.status, false, { cause: error });
}

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

  inFlight = policyengine
    .getMetadata<{ version?: string; variables?: Record<string, unknown> } | null>('us')
    .then((result) => {
      const version = result?.version ?? 'unknown';
      const variables = new Set(Object.keys(result?.variables ?? {}));
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

type CalculatedHousehold = Record<string, Record<string, EntityResult>>;

/** Sum a variable across every entity of every group it appears in. */
function readTotal(
  result: CalculatedHousehold,
  variable: string,
  year: string,
): number {
  let total = 0;
  let found = false;
  Object.values(result).forEach((group) => {
    Object.values(group).forEach((entity) => {
      const values = entity?.[variable];
      if (values && values[year] !== undefined && values[year] !== null) {
        total = total + Number(values[year]);
        found = true;
      }
    });
  });
  return found ? total : 0;
}

function readFirst(
  result: CalculatedHousehold,
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
  referenceMonth: string;
  metadata: ApiMetadata;
  signal?: AbortSignal;
}

/**
 * Post the household to the API and read the reference-month result as the monthly
 * figures the UI shows, per docs/DATA_CONTRACT.md.
 */
export async function calculateLive({
  config,
  household,
  year,
  referenceMonth,
  metadata,
  signal,
}: CalculateOptions): Promise<LiveResult> {
  const missing = missingVariables(config, metadata);
  if (missing.length > 0) {
    throw new Error(
      `The live API runs policyengine-us ${metadata.version}, which does not include ${missing.join(', ')}.`,
    );
  }
  const situation = buildSituation(config, household, year, metadata.variables, referenceMonth);
  if (householdCalculationPauseRemaining() > 0) {
    // Held back during the pause after a refusal, so never sent.
    throw new LiveCalculationError(HELD_BACK_MESSAGE, null, true);
  }
  let result: CalculatedHousehold | null;
  try {
    // Throws PolicyEngineApiError, carrying the dashboard API's or the Public
    // API's message, for anything but a calculated household.
    result = await policyengine.calculateHousehold<CalculatedHousehold | null>(
      // The spread gives the client the plain object type its Household expects.
      { country: 'us', household: { ...situation } },
      { signal },
    );
  } catch (error) {
    // A cancelled calculation is rethrown as the client threw it.
    if (signal?.aborted || !(error instanceof PolicyEngineApiError)) throw error;
    const failure = calculationError(error);
    if (failure.rateLimited) {
      // Pause at once, even if the caller has already seen another
      // calculation fail and never sees this refusal. The pause notice
      // below the exact-calculation card gives this failure's message.
      pauseHouseholdCalculations(RATE_LIMIT_WAIT_MILLISECONDS, failure.message);
    }
    throw failure;
  }
  if (!result) {
    throw new Error('The PolicyEngine API could not compute this household.');
  }

  const year_ = String(year);
  const subsidy = readTotal(result, config.main, referenceMonth);
  const factor =
    config.copay_factor === 'days' ? household.attendingDaysPerMonth : config.copay_factor;
  const childCareSubsidies = readTotal(result, 'child_care_subsidies', referenceMonth);
  const eligibleRaw = config.eligible ? readFirst(result, config.eligible, referenceMonth) : null;
  const eligible = config.eligible ? Boolean(eligibleRaw) : subsidy > 0;
  // The model computes a would-be copay for ineligible families too.
  const copay = eligible ? readTotal(result, config.copay, referenceMonth) * factor : 0;
  const charge = household.monthlyChargePerChild * household.childAges.length;

  return {
    subsidy,
    copay,
    outOfPocket: outOfPocketCost(charge, subsidy, copay),
    eligible,
    fpg: readTotal(result, 'spm_unit_fpg', year_),
    smi: readTotal(result, 'hhs_smi', year_),
    childCareSubsidies,
    version: metadata.version,
  };
}
