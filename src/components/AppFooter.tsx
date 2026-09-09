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
          Data version: policyengine-us {metadata.policyengine_us_version}, policy year{' '}
          {metadata.year}.
        </p>
      ) : null}
    </footer>
  );
}
