/** The calculator's form state and how it maps onto model inputs. */

import { defaultHoursPerDay } from './dataLookup';
import type { InputValue } from './situation';
import type { StateInput, StateInputConfig } from './types';

export interface ChildSpec {
  age: number;
  hoursPerDay: number;
}

export interface CalculatorForm {
  state: string;
  adults: number;
  children: ChildSpec[];
  /** Annual earned income of the first adult. */
  income: number;
  monthlyChargePerChild: number;
  daysPerWeek: number;
  attendingDaysPerMonth: number;
  inActivity: boolean;
  /** Maps onto every enrollment-style input the state defines. */
  receiving: boolean;
  /** Every other state-specific input, keyed by variable name. */
  providerInputs: Record<string, InputValue>;
}

export const MAX_CHILD_AGE = 12;
export const MAX_CHILDREN = 6;

/**
 * Inputs meaning "already receiving the subsidy", which switch a state to its
 * redetermination income limit (docs/DATA_CONTRACT.md).
 */
const ENROLLMENT_SUFFIXES = [
  '_enrolled',
  '_is_in_re_determination_process',
  '_at_redetermination',
];

export function isEnrollmentInput(input: StateInput): boolean {
  return ENROLLMENT_SUFFIXES.some((suffix) => input.name.endsWith(suffix));
}

export function enrollmentInputs(config: StateInputConfig): StateInput[] {
  return config.inputs.filter(isEnrollmentInput);
}

export function providerInputDefinitions(config: StateInputConfig): StateInput[] {
  return config.inputs.filter((input) => !isEnrollmentInput(input));
}

export function defaultProviderInputs(config: StateInputConfig): Record<string, InputValue> {
  const values: Record<string, InputValue> = {};
  providerInputDefinitions(config).forEach((input) => {
    values[input.name] = input.default;
  });
  return values;
}

export function defaultChildren(): ChildSpec[] {
  return [3, 7].map((age) => ({ age, hoursPerDay: defaultHoursPerDay(age) }));
}

export function defaultForm(state: string): CalculatorForm {
  return {
    state,
    adults: 1,
    children: defaultChildren(),
    income: 30000,
    monthlyChargePerChild: 1500,
    daysPerWeek: 5,
    attendingDaysPerMonth: 22,
    inActivity: true,
    receiving: false,
    providerInputs: {},
  };
}

/** Split the form's state-specific inputs into person- and SPM-unit-level maps. */
export function splitInputs(
  config: StateInputConfig,
  form: CalculatorForm,
): { personInputs: Record<string, InputValue>; spmInputs: Record<string, InputValue> } {
  const personInputs: Record<string, InputValue> = {};
  const spmInputs: Record<string, InputValue> = {};
  config.inputs.forEach((input) => {
    const value = isEnrollmentInput(input)
      ? form.receiving
      : (form.providerInputs[input.name] ?? input.default);
    if (input.entity === 'person') personInputs[input.name] = value;
    else spmInputs[input.name] = value;
  });
  return { personInputs, spmInputs };
}

/** Provider inputs the user moved away from the reference-grid default. */
export function changedProviderInputs(
  config: StateInputConfig,
  form: CalculatorForm,
): StateInput[] {
  return providerInputDefinitions(config).filter((input) => {
    const value = form.providerInputs[input.name];
    return value !== undefined && value !== input.default;
  });
}
