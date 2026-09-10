import { describe, expect, it } from 'vitest';
import {
  changedProviderInputs,
  defaultForm,
  defaultProviderInputs,
  enrollmentInputs,
  isEnrollmentInput,
  providerInputDefinitions,
  splitInputs,
} from './household';
import { MD_CONFIG } from './__fixtures__/data';
import type { StateInput } from './types';

function input(name: string, entity: StateInput['entity'] = 'spm_unit'): StateInput {
  return { name, label: name, entity, type: 'bool', default: false };
}

describe('enrollment inputs', () => {
  it('recognises the three "already receiving" suffixes', () => {
    expect(isEnrollmentInput(input('md_ccs_enrolled'))).toBe(true);
    expect(isEnrollmentInput(input('mi_ccap_is_in_re_determination_process'))).toBe(true);
    expect(isEnrollmentInput(input('nc_scca_at_redetermination'))).toBe(true);
    expect(isEnrollmentInput(input('md_ccs_provider_type'))).toBe(false);
    expect(isEnrollmentInput(input('enrolled_children_count'))).toBe(false);
  });

  it('splits a config into enrollment and provider inputs', () => {
    expect(enrollmentInputs(MD_CONFIG).map((i) => i.name)).toEqual(['md_ccs_enrolled']);
    expect(providerInputDefinitions(MD_CONFIG).map((i) => i.name)).toEqual([
      'md_ccs_provider_type',
    ]);
    expect(defaultProviderInputs(MD_CONFIG)).toEqual({ md_ccs_provider_type: 'NONE' });
  });
});

describe('defaultForm', () => {
  it('starts with the reference household for the given state', () => {
    const form = defaultForm('TX');
    expect(form.state).toBe('TX');
    expect(form.adults).toBe(1);
    expect(form.children).toEqual([
      { age: 3, hoursPerDay: 8 },
      { age: 7, hoursPerDay: 3 },
    ]);
    expect(form.income).toBe(30000);
    expect(form.monthlyChargePerChild).toBe(1500);
    expect(form.daysPerWeek).toBe(5);
    expect(form.attendingDaysPerMonth).toBe(22);
    expect(form.inActivity).toBe(true);
    expect(form.receiving).toBe(false);
    expect(form.providerInputs).toEqual({});
  });
});

describe('splitInputs', () => {
  it('routes inputs by entity and maps "receiving" onto every enrollment input', () => {
    const form = { ...defaultForm('MD'), receiving: true };
    expect(splitInputs(MD_CONFIG, form)).toEqual({
      personInputs: { md_ccs_provider_type: 'NONE' },
      spmInputs: { md_ccs_enrolled: true },
    });
  });

  it('uses the chosen provider value when set', () => {
    const form = {
      ...defaultForm('MD'),
      providerInputs: { md_ccs_provider_type: 'INFORMAL' },
    };
    expect(splitInputs(MD_CONFIG, form).personInputs).toEqual({
      md_ccs_provider_type: 'INFORMAL',
    });
    expect(splitInputs(MD_CONFIG, form).spmInputs).toEqual({ md_ccs_enrolled: false });
  });
});

describe('changedProviderInputs', () => {
  it('is empty when nothing was touched or the default was re-selected', () => {
    expect(changedProviderInputs(MD_CONFIG, defaultForm('MD'))).toEqual([]);
    const same = { ...defaultForm('MD'), providerInputs: { md_ccs_provider_type: 'NONE' } };
    expect(changedProviderInputs(MD_CONFIG, same)).toEqual([]);
  });

  it('lists provider inputs moved off the default, never enrollment inputs', () => {
    const form = {
      ...defaultForm('MD'),
      receiving: true,
      providerInputs: { md_ccs_provider_type: 'INFORMAL' },
    };
    expect(changedProviderInputs(MD_CONFIG, form).map((i) => i.name)).toEqual([
      'md_ccs_provider_type',
    ]);
  });
});
