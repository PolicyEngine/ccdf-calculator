import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import CalculatorResults from './CalculatorResults';

type Props = ComponentProps<typeof CalculatorResults>;

// A refusal's message without characters that the markup escapes.
const REFUSAL_REASON =
  'Everyone on your network, such as a workshop or an office, shares a limit on calculations a minute, and it has been reached.';

/** The props of a reader whose inputs changed since the last answer, during a pause. */
function pausedPropsWithChangedInputs(): Props {
  return {
    config: { name: 'Maryland', program: 'Child Care Scholarship' },
    metadata: {
      policyengine_us_version: '2.23.5',
      reference_month: '2026-01',
      child_structures: { two_children: { ages: [3, 7] } },
    },
    form: { income: 30_000, monthlyChargePerChild: 1_500, children: [{ age: 3 }, { age: 7 }] },
    estimate: {
      subsidy: 1_949,
      copay: 0,
      outOfPocket: 1_051,
      eligible: true,
      fpg: 27_000,
      smi: 110_000,
      chargeLevel: 1_500,
      childKey: 'two_children',
      adults: 1,
    },
    gaps: [],
    live: null,
    liveStale: true,
    liveError: null,
    calculating: false,
    calculationPause: { secondsRemaining: 30, reason: REFUSAL_REASON },
    apiVersion: '2.23.5',
    apiOlderThanGrid: false,
    apiBlockedReason: null,
    onCalculate: () => undefined,
  } as unknown as Props;
}

/** The complete markup of the `<div>` that starts at `startIndex` in `markup`. */
function divElementAt(markup: string, startIndex: number): string {
  const divTag = /<div\b|<\/div>/g;
  divTag.lastIndex = startIndex;
  let openDivs = 0;
  for (let tag = divTag.exec(markup); tag; tag = divTag.exec(markup)) {
    openDivs += tag[0] === '</div>' ? -1 : 1;
    if (openDivs === 0) {
      return markup.slice(startIndex, tag.index + '</div>'.length);
    }
  }
  throw new Error('The <div> is not closed.');
}

describe('CalculatorResults during the pause after a rate-limit refusal', () => {
  it('keeps the pause notice out of the exact-calculation card, which is dimmed when the inputs have changed', () => {
    const markup = renderToStaticMarkup(createElement(CalculatorResults, pausedPropsWithChangedInputs()));

    const staleCardStart = markup.indexOf('<div class="mode-card stale">');
    expect(staleCardStart).toBeGreaterThanOrEqual(0);
    const staleCard = divElementAt(markup, staleCardStart);
    expect(staleCard).toContain('Calculate again in 30 s');
    expect(staleCard).not.toContain(REFUSAL_REASON);

    expect(markup).toContain(
      `<p class="calculation-pause-notice"><span role="status">${REFUSAL_REASON}</span> This page can calculate again in 30 s.</p>`,
    );
  });
});
