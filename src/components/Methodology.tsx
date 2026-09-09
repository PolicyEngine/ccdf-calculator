import { fmtCurrency } from '@/lib/format';
import type { Metadata } from '@/lib/types';

export default function Methodology({ metadata }: { metadata: Metadata }) {
  const { assumptions } = metadata;
  return (
    <section className="methodology">
      <h2>About this calculator</h2>
      <p>
        This tool reports the child care subsidy each state pays under its own program funded
        by the federal Child Care and Development Fund, as encoded in policyengine-us{' '}
        {metadata.policyengine_us_version} for {metadata.year}. All 50 states and the District of
        Columbia are covered.
      </p>

      <h3>How the two modes differ</h3>
      <p>
        The <strong>estimate</strong> reads a precomputed grid of reference households, so it
        updates as you type. The <strong>exact calculation</strong> posts your household to the
        live PolicyEngine API, which runs its own deployed version of policyengine-us; that
        version can lag the one behind the grid, and some state programs are not in it yet.
      </p>

      <h3>Reference household assumptions</h3>
      <ul>
        <li>
          Every adult works {assumptions.weekly_hours_worked} hours a week and only the first
          adult has earnings.
        </li>
        <li>
          Children under five attend 8 hours a day and school-age children 3 hours a day,{' '}
          {assumptions.days_per_week} days a week, {assumptions.attending_days_per_month} days a
          month.
        </li>
        <li>
          The provider charges {fmtCurrency(assumptions.monthly_charge_per_child)} per child per
          month at the default grid level, and the grid is also computed at{' '}
          {metadata.charge_levels.map((level) => fmtCurrency(level)).join(', ')}.
        </li>
        <li>The provider is {assumptions.provider}.</li>
        <li>
          Each state uses its most populous county, which matters for the 30 states whose rates
          vary by county.
        </li>
        <li>
          Income is earned income only. Assets, unearned income, child support and special-needs
          rates are not varied.
        </li>
      </ul>

      <h3>Limits</h3>
      <p>
        States run waiting lists and fund a limited number of children, so being eligible in the
        model does not guarantee a subsidy. Copays are converted to a monthly figure from the
        weekly or daily amounts states publish. For a full household simulation covering taxes
        and other benefits, use <a href="https://policyengine.org/us">PolicyEngine US</a>; the
        rules themselves live in{' '}
        <a href="https://github.com/PolicyEngine/policyengine-us">policyengine-us</a>.
      </p>
    </section>
  );
}
