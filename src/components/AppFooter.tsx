import { fmtMonth } from '@/lib/format';
import type { Metadata } from '@/lib/types';

export default function AppFooter({ metadata }: { metadata: Metadata | null }) {
  return (
    <footer className="app-footer">
      <p>
        Built by <a href="https://policyengine.org">PolicyEngine</a> from the state child care
        subsidy rules encoded in{' '}
        <a href="https://github.com/PolicyEngine/policyengine-us">policyengine-us</a>. Eligibility
        in the model does not guarantee a place: states run waiting lists and fund a limited
        number of children.
      </p>
      {metadata ? (
        <p className="data-version">
          Household estimates: policyengine-us {metadata.policyengine_us_version}, rules for{' '}
          {fmtMonth(metadata.reference_month)}. Population estimates show their own vintage.
        </p>
      ) : null}
    </footer>
  );
}
