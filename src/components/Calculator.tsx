'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AppFooter from './AppFooter';
import CalculatorInputs from './CalculatorInputs';
import CalculatorResults from './CalculatorResults';
import Methodology from './Methodology';
import StructureChart from './StructureChart';
import SubsidyChart from './SubsidyChart';
import TabNav from './TabNav';
import { calculateLive, fetchApiMetadata, missingVariables, type LiveResult } from '@/lib/api';
import {
  CHILD_STRUCTURE_LABELS,
  estimate as estimateFromGrid,
  incomeSeries,
  loadMetadata,
  loadStateData,
  loadStateInputs,
  nearestChargeIndex,
  referenceGaps,
  structureComparison,
} from '@/lib/dataLookup';
import { fmtCurrency } from '@/lib/format';
import {
  changedProviderInputs,
  defaultForm,
  splitInputs,
  type CalculatorForm,
} from '@/lib/household';
import type { Metadata, StateData, StateInputsFile } from '@/lib/types';
import { isOlderThan } from '@/lib/version';

const DEFAULT_STATE = 'CA';

export default function Calculator() {
  const searchParams = useSearchParams();
  const requestedState = searchParams.get('state');

  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [stateInputs, setStateInputs] = useState<StateInputsFile | null>(null);
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<CalculatorForm>(() =>
    defaultForm(requestedState && /^[A-Z]{2}$/.test(requestedState) ? requestedState : DEFAULT_STATE),
  );

  const [apiVersion, setApiVersion] = useState<string | null>(null);
  const [apiVariables, setApiVariables] = useState<Set<string> | null>(null);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [liveStale, setLiveStale] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    Promise.all([loadMetadata(), loadStateInputs()])
      .then(([meta, inputs]) => {
        setMetadata(meta);
        setStateInputs(inputs);
        // A bad `?state=` in the URL falls back to the default state.
        setForm((previous) =>
          meta.states.some((state) => state.code === previous.state)
            ? previous
            : { ...previous, state: DEFAULT_STATE },
        );
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  // Only load a state file once metadata confirms the code exists.
  const knownState = useMemo(
    () => (metadata ? metadata.states.some((state) => state.code === form.state) : false),
    [metadata, form.state],
  );

  useEffect(() => {
    if (!knownState) return;
    let cancelled = false;
    loadStateData(form.state)
      .then((data) => {
        if (!cancelled) setStateData(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [form.state, knownState]);

  useEffect(() => {
    fetchApiMetadata()
      .then((meta) => {
        setApiVersion(meta.version);
        setApiVariables(meta.variables);
      })
      .catch(() => {
        setApiVersion(null);
      });
  }, []);

  const config = stateInputs?.states[form.state] ?? null;

  const update = useCallback((patch: Partial<CalculatorForm>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setLiveStale(true);
    setLiveError(null);
  }, []);

  const chargeIndex = useMemo(
    () => (metadata ? nearestChargeIndex(metadata, form.monthlyChargePerChild) : 0),
    [metadata, form.monthlyChargePerChild],
  );

  const estimate = useMemo(() => {
    if (!metadata || !stateData) return null;
    return estimateFromGrid(metadata, stateData, {
      adults: form.adults,
      childAges: form.children.map((child) => child.age),
      income: form.income,
      monthlyChargePerChild: form.monthlyChargePerChild,
    });
  }, [metadata, stateData, form]);

  const gaps = useMemo(() => {
    if (!metadata || !config) return [];
    const base = referenceGaps(
      metadata,
      {
        adults: form.adults,
        childAges: form.children.map((child) => child.age),
        hoursPerDay: form.children.map((child) => child.hoursPerDay),
        daysPerWeek: form.daysPerWeek,
        attendingDaysPerMonth: form.attendingDaysPerMonth,
        monthlyChargePerChild: form.monthlyChargePerChild,
        inActivity: form.inActivity,
      },
      chargeIndex,
    );
    const changed = changedProviderInputs(config, form);
    if (changed.length > 0) {
      base.push(
        'Provider details are read at the state default; the grid does not vary them.',
      );
    }
    if (form.receiving) {
      base.push('The grid assumes a new applicant, not a family already receiving the subsidy.');
    }
    return base;
  }, [metadata, config, form, chargeIndex]);

  const chartData = useMemo(() => {
    if (!metadata || !stateData || !estimate) return [];
    return incomeSeries(metadata, stateData, estimate.key, chargeIndex);
  }, [metadata, stateData, estimate, chargeIndex]);

  const structureData = useMemo(() => {
    if (!metadata || !stateData) return [];
    return structureComparison(metadata, stateData, form.adults, chargeIndex, form.income);
  }, [metadata, stateData, form.adults, chargeIndex, form.income]);

  /**
   * The deployed API often lags the version the grid was built with. When it
   * does, a live result reflects older rules, so the estimate stays the
   * headline and the live figure is shown only in its own card.
   */
  const apiOlderThanGrid = useMemo(
    () => (metadata ? isOlderThan(apiVersion, metadata.policyengine_us_version) : false),
    [apiVersion, metadata],
  );

  const apiBlockedReason = useMemo(() => {
    if (!config || !metadata) return null;
    if (!apiVariables || !apiVersion) return null;
    const missing = missingVariables(config, { version: apiVersion, variables: apiVariables });
    if (missing.length === 0) return null;
    return `The live API runs policyengine-us ${apiVersion}, which does not yet include this state's program; the estimate uses version ${metadata.policyengine_us_version}.`;
  }, [config, metadata, apiVariables, apiVersion]);

  const runExact = useCallback(async () => {
    if (!config || !metadata || !apiVariables || !apiVersion) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setCalculating(true);
    setLiveError(null);
    const { personInputs, spmInputs } = splitInputs(config, form);
    try {
      const result = await calculateLive({
        config,
        metadata: { version: apiVersion, variables: apiVariables },
        year: metadata.year,
        signal: controller.signal,
        household: {
          state: form.state,
          county: config.county,
          adults: form.adults,
          childAges: form.children.map((child) => child.age),
          hoursPerDay: form.children.map((child) => child.hoursPerDay),
          daysPerWeek: form.daysPerWeek,
          attendingDaysPerMonth: form.attendingDaysPerMonth,
          income: form.income,
          monthlyChargePerChild: form.monthlyChargePerChild,
          inActivity: form.inActivity,
          personInputs,
          spmInputs,
        },
      });
      setLive(result);
      setLiveStale(false);
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setLiveError((error as Error).message);
    } finally {
      setCalculating(false);
    }
  }, [config, metadata, apiVariables, apiVersion, form]);

  if (loadError) {
    return (
      <div className="app">
        <div className="error">{loadError}</div>
      </div>
    );
  }

  if (!metadata || !stateInputs) {
    return (
      <div className="app">
        <div className="loading">Loading child care subsidy rules…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Child care subsidy calculator</h1>
        <p>What every state pays toward child care, and what the family pays</p>
      </header>

      <TabNav />

      <main>
        <div className="stack">
          <CalculatorInputs
            metadata={metadata}
            config={config}
            form={form}
            onChange={update}
          />

          {estimate && config ? (
            <CalculatorResults
              config={config}
              metadata={metadata}
              form={form}
              estimate={estimate}
              gaps={gaps}
              live={live}
              liveStale={liveStale}
              liveError={liveError}
              calculating={calculating}
              apiVersion={apiVersion}
              apiOlderThanGrid={apiOlderThanGrid}
              apiBlockedReason={apiBlockedReason}
              onCalculate={runExact}
            />
          ) : (
            <div className="loading">Loading state data…</div>
          )}

          {estimate ? (
            <section className="results-panel">
              <div className="charts-grid">
                <div className="chart-container">
                  <h3>Subsidy and copay by income</h3>
                  <p className="chart-subtitle">
                    {CHILD_STRUCTURE_LABELS[estimate.childKey]}, {estimate.adults}{' '}
                    {estimate.adults === 1 ? 'adult' : 'adults'}, a{' '}
                    {fmtCurrency(estimate.chargeLevel)} monthly charge per child.
                  </p>
                  <SubsidyChart data={chartData} income={form.income} />
                </div>
                <div className="chart-container">
                  <h3>Subsidy by family type at your income</h3>
                  <p className="chart-subtitle">
                    Monthly subsidy at {fmtCurrency(form.income)} of earnings for each reference
                    family.
                  </p>
                  <StructureChart data={structureData} highlight={estimate.childKey} />
                </div>
              </div>
            </section>
          ) : null}

          <Methodology metadata={metadata} />
        </div>
      </main>

      <AppFooter metadata={metadata} />
    </div>
  );
}
