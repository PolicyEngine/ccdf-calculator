'use client';

import type { LiveResult } from '@/lib/api';
import type { Estimate } from '@/lib/dataLookup';
import { CHILD_STRUCTURE_LABELS } from '@/lib/dataLookup';
import { fmtCurrency, fmtPercent } from '@/lib/format';
import type { CalculatorForm } from '@/lib/household';
import type { Metadata, StateInputConfig } from '@/lib/types';

interface Props {
  config: StateInputConfig;
  metadata: Metadata;
  form: CalculatorForm;
  estimate: Estimate;
  gaps: string[];
  live: LiveResult | null;
  liveStale: boolean;
  liveError: string | null;
  calculating: boolean;
  apiVersion: string | null;
  /** The live API runs an older policyengine-us than the grid was built with. */
  apiOlderThanGrid: boolean;
  apiBlockedReason: string | null;
  onCalculate: () => void;
}

export default function CalculatorResults({
  config,
  metadata,
  form,
  estimate,
  gaps,
  live,
  liveStale,
  liveError,
  calculating,
  apiVersion,
  apiOlderThanGrid,
  apiBlockedReason,
  onCalculate,
}: Props) {
  const gridVersion = metadata.policyengine_us_version;
  const liveFresh = Boolean(live) && !liveStale;
  // An older API models older rules, so it never replaces the headline.
  const showLive = liveFresh && !apiOlderThanGrid;
  const shown = showLive && live ? live : estimate;
  const fpg = showLive && live ? live.fpg : estimate.fpg;
  const smi = showLive && live ? live.smi : estimate.smi;
  const shareOfFpg = fpg > 0 ? form.income / fpg : 0;
  const shareOfSmi = smi > 0 ? form.income / smi : 0;
  const eligible = shown.eligible;

  const staleVersion = apiOlderThanGrid && apiVersion;
  const zeroUnderOlderModel =
    apiOlderThanGrid && liveFresh && live !== null && live.subsidy === 0 && estimate.subsidy > 0;

  const exactNotes: string[] = [];
  if (apiBlockedReason) {
    exactNotes.push(apiBlockedReason);
  } else {
    if (liveStale && live) {
      exactNotes.push('Inputs changed since this was calculated.');
    } else if (!live) {
      exactNotes.push('Runs your exact household against the live PolicyEngine API.');
    } else if (!apiOlderThanGrid) {
      exactNotes.push(`Your exact household on policyengine-us ${live.version}.`);
    }
    if (staleVersion) {
      exactNotes.push(
        `The live API runs policyengine-us ${apiVersion}, older than the ${gridVersion} rules behind the estimate; this state's rules may have changed since.`,
      );
    }
    if (zeroUnderOlderModel) {
      exactNotes.push('The older model may not include recent changes to this program.');
    }
  }

  return (
    <section className="results-panel">
      <div className={`result-banner ${eligible ? '' : 'not-eligible'}`}>
        <div className="result-banner-main">
          <h3>Monthly subsidy the state pays</h3>
          <div className="amount">{fmtCurrency(shown.subsidy)}</div>
          <div className="amount-annual">{fmtCurrency(shown.subsidy * 12)} a year</div>
        </div>

        <div className="result-banner-details">
          <span className={`eligibility-status ${eligible ? 'eligible' : 'not-eligible'}`}>
            {eligible ? 'Eligible' : 'Not eligible'}
          </span>
          <div className="result-meta">
            <span>{config.program}</span>
            <span>
              {showLive && live
                ? `Exact calculation, policyengine-us ${live.version}`
                : `Estimate from the precomputed grid, policyengine-us ${gridVersion}`}
            </span>
          </div>
        </div>

        <div className="result-banner-stats">
          <div className="stat-item">
            <span className="stat-label">Family copay</span>
            <span className="stat-value">{fmtCurrency(shown.copay)}/mo</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Out of pocket</span>
            <span className="stat-value">{fmtCurrency(shown.outOfPocket)}/mo</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Income vs poverty line</span>
            <span className="stat-value">{fmtPercent(shareOfFpg, 0)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Income vs state median</span>
            <span className="stat-value">{fmtPercent(shareOfSmi, 0)}</span>
          </div>
        </div>
      </div>

      <div className="mode-row">
        <div className="mode-card">
          <span className="mode-tag">Estimate</span>
          <span className="mode-value">{fmtCurrency(estimate.subsidy)}/mo</span>
          <span className="mode-note">
            Reference household: {estimate.adults === 1 ? '1 adult' : '2 adults'},{' '}
            {(CHILD_STRUCTURE_LABELS[estimate.childKey] ?? estimate.childKey).toLowerCase()}, a{' '}
            {fmtCurrency(estimate.chargeLevel)} monthly charge per child. Rules from
            policyengine-us {gridVersion}.
          </span>
        </div>

        <div className={`mode-card ${liveStale ? 'stale' : ''}`}>
          <span className="mode-tag">Exact calculation</span>
          <span className="mode-value">{live ? `${fmtCurrency(live.subsidy)}/mo` : '—'}</span>
          {liveFresh && live ? (
            <span className="mode-note">
              {live.eligible ? 'Eligible' : 'Not eligible'} in the live model, copay{' '}
              {fmtCurrency(live.copay)}/mo.
            </span>
          ) : null}
          {exactNotes.map((note) => (
            <span key={note} className="mode-note">
              {note}
            </span>
          ))}
          <button
            type="button"
            className="calculate-btn"
            onClick={onCalculate}
            disabled={calculating || Boolean(apiBlockedReason) || !apiVersion}
          >
            {calculating ? 'Calculating…' : 'Calculate exactly'}
          </button>
        </div>
      </div>

      {liveError ? <div className="error">{liveError}</div> : null}

      {gaps.length > 0 ? (
        <div className="assumption-note">
          <strong>The estimate reads your household onto a reference household.</strong>
          <ul>
            {gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
          <p>
            Run the exact calculation to use your household as entered, including provider
            details.
          </p>
        </div>
      ) : null}
    </section>
  );
}
