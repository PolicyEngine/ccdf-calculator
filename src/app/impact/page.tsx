import type { Metadata } from 'next';
import Impact from '@/components/Impact';

export const metadata: Metadata = {
  title: 'Child care subsidy population impact by state | PolicyEngine',
  description:
    'Estimated eligible children, eligible families and the potential annual child care subsidy by state, from the PolicyEngine microsimulation.',
  alternates: { canonical: 'https://policyengine.org/us/ccdf-calculator/impact' },
};

export default function ImpactPage() {
  return <Impact />;
}
