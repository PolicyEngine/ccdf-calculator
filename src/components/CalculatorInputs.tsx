'use client';

import { useMemo } from 'react';
import { defaultHoursPerDay } from '@/lib/dataLookup';
import { cleanLabel, formatCountyName } from '@/lib/format';
import {
  MAX_CHILDREN,
  MAX_CHILD_AGE,
  enrollmentInputs,
  providerInputDefinitions,
  type CalculatorForm,
  type ChildSpec,
} from '@/lib/household';
import type { InputValue } from '@/lib/situation';
import type { Metadata, StateInput, StateInputConfig } from '@/lib/types';

interface Props {
  metadata: Metadata;
  config: StateInputConfig | null;
  form: CalculatorForm;
  onChange: (patch: Partial<CalculatorForm>) => void;
}

const withCommas = (value: number) => value.toLocaleString('en-US');

function CurrencyField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={withCommas(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/[^0-9]/g, '');
          onChange(digits === '' ? 0 : Number(digits));
        }}
      />
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function StateInputField({
  input,
  stateName,
  value,
  onChange,
}: {
  input: StateInput;
  stateName: string;
  value: InputValue;
  onChange: (value: InputValue) => void;
}) {
  const label = cleanLabel(input.label, stateName);
  const id = `input-${input.name}`;

  if (input.type === 'bool') {
    return (
      <div className="form-group form-group-check">
        <label className="check-line" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{label}</span>
        </label>
      </div>
    );
  }

  if (input.type === 'enum') {
    return (
      <div className="form-group">
        <label htmlFor={id}>{label}</label>
        <select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
          {(input.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={Number(value)}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </div>
  );
}

export default function CalculatorInputs({ metadata, config, form, onChange }: Props) {
  const providerInputs = useMemo(
    () => (config ? providerInputDefinitions(config) : []),
    [config],
  );
  const hasEnrollmentInput = config ? enrollmentInputs(config).length > 0 : false;
  const stateName = config?.name ?? '';

  const setChild = (index: number, patch: Partial<ChildSpec>) => {
    const children = form.children.map((child, i) =>
      i === index ? { ...child, ...patch } : child,
    );
    onChange({ children });
  };

  const addChild = () => {
    if (form.children.length >= MAX_CHILDREN) return;
    onChange({ children: [...form.children, { age: 3, hoursPerDay: defaultHoursPerDay(3) }] });
  };

  const removeChild = (index: number) => {
    if (form.children.length <= 1) return;
    onChange({ children: form.children.filter((_, i) => i !== index) });
  };

  return (
    <section className="input-panel">
      <h2>Your household</h2>

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="state">State</label>
          <select
            id="state"
            value={form.state}
            onChange={(event) => onChange({ state: event.target.value, providerInputs: {} })}
          >
            {metadata.states.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          {config ? <small>{config.program}</small> : null}
        </div>

        <div className="form-group">
          <label htmlFor="adults">Adults in the household</label>
          <select
            id="adults"
            value={form.adults}
            onChange={(event) => onChange({ adults: Number(event.target.value) })}
          >
            <option value={1}>1 adult</option>
            <option value={2}>2 adults</option>
          </select>
          <small>Every adult works 40 hours a week.</small>
        </div>

        <CurrencyField
          id="income"
          label="Annual earned income"
          value={form.income}
          onChange={(income) => onChange({ income })}
        />

        <CurrencyField
          id="charge"
          label="Provider charge per child"
          hint="Dollars per child per month, before any subsidy."
          value={form.monthlyChargePerChild}
          onChange={(monthlyChargePerChild) => onChange({ monthlyChargePerChild })}
        />

        <div className="form-group">
          <label htmlFor="days-per-week">Care days per week</label>
          <input
            id="days-per-week"
            type="number"
            min={1}
            max={7}
            value={form.daysPerWeek}
            onChange={(event) =>
              onChange({ daysPerWeek: Math.min(7, Math.max(1, Number(event.target.value) || 1)) })
            }
          />
        </div>

        <div className="form-group">
          <label htmlFor="attending-days">Attending days per month</label>
          <input
            id="attending-days"
            type="number"
            min={1}
            max={31}
            value={form.attendingDaysPerMonth}
            onChange={(event) =>
              onChange({
                attendingDaysPerMonth: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
              })
            }
          />
        </div>
      </div>

      <fieldset className="child-editor">
        <legend>Children in paid care</legend>
        <div className="child-rows">
          {form.children.map((child, index) => (
            <div className="child-row" key={index}>
              <div className="form-group">
                <label htmlFor={`child-age-${index}`}>Child {index + 1} age</label>
                <input
                  id={`child-age-${index}`}
                  type="number"
                  min={0}
                  max={MAX_CHILD_AGE}
                  value={child.age}
                  onChange={(event) => {
                    const age = Math.min(
                      MAX_CHILD_AGE,
                      Math.max(0, Number(event.target.value) || 0),
                    );
                    setChild(index, { age, hoursPerDay: defaultHoursPerDay(age) });
                  }}
                />
              </div>
              <div className="form-group">
                <label htmlFor={`child-hours-${index}`}>Care hours per day</label>
                <input
                  id={`child-hours-${index}`}
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={child.hoursPerDay}
                  onChange={(event) =>
                    setChild(index, {
                      hoursPerDay: Math.min(24, Math.max(0, Number(event.target.value) || 0)),
                    })
                  }
                />
              </div>
              <button
                type="button"
                className="reset-btn child-remove"
                onClick={() => removeChild(index)}
                disabled={form.children.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="expand-btn"
          onClick={addChild}
          disabled={form.children.length >= MAX_CHILDREN}
        >
          Add a child
        </button>
      </fieldset>

      <div className="check-list">
        <label className="check-line">
          <input
            type="checkbox"
            checked={form.inActivity}
            onChange={(event) => onChange({ inActivity: event.target.checked })}
          />
          <span>Parent works or is in an approved activity</span>
        </label>
        {hasEnrollmentInput ? (
          <label className="check-line">
            <input
              type="checkbox"
              checked={form.receiving}
              onChange={(event) => onChange({ receiving: event.target.checked })}
            />
            <span>Currently receiving this subsidy</span>
          </label>
        ) : null}
      </div>

      {config && providerInputs.length > 0 ? (
        <details className="provider-details">
          <summary>Provider details ({providerInputs.length})</summary>
          <div className="form-grid">
            {providerInputs.map((input) => (
              <StateInputField
                key={input.name}
                input={input}
                stateName={stateName}
                value={form.providerInputs[input.name] ?? input.default}
                onChange={(value) =>
                  onChange({ providerInputs: { ...form.providerInputs, [input.name]: value } })
                }
              />
            ))}
          </div>
          <p className="field-note">
            The estimate uses the state's default provider and quality tier. Change these and
            run an exact calculation to see how they affect the subsidy.
          </p>
        </details>
      ) : null}

      {config?.county ? (
        <p className="field-note">
          County is fixed to {formatCountyName(config.county)} in this version.
        </p>
      ) : null}
    </section>
  );
}
