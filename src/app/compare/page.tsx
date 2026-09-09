import type { Metadata } from 'next';
import Compare from '@/components/Compare';

export const metadata: Metadata = {
  title: 'Compare state child care subsidies | PolicyEngine',
  description:
    'Compare the monthly child care subsidy, family copay and income cutoff of all 51 state child care subsidy programs funded by the Child Care and Development Fund.',
  alternates: { canonical: 'https://policyengine.org/us/ccdf-calculator/compare' },
};

export default function ComparePage() {
  return <Compare />;
}
