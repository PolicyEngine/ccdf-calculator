import { useEffect, useState } from 'react';

import {
  householdCalculationPauseReason,
  householdCalculationPauseSeconds,
  onHouseholdCalculationPause,
} from './api';

/** The pause after a refusal for the firewall's limit, as the page shows it. */
export interface HouseholdCalculationPause {
  /** Whole seconds until the page may calculate again, rounded up; 0 when it may now. */
  secondsRemaining: number;
  /** The user-facing message of the failure that started the pause. */
  reason: string;
}

function readHouseholdCalculationPause(): HouseholdCalculationPause {
  return {
    secondsRemaining: householdCalculationPauseSeconds(),
    reason: householdCalculationPauseReason(),
  };
}

/**
 * Calls `report` with the pause as it is now, then whenever a pause starts or
 * is ended early, and once a second while one runs, the last time with 0
 * seconds. Returns the function that stops watching.
 */
export function watchHouseholdCalculationPause(
  report: (pause: HouseholdCalculationPause) => void,
): () => void {
  let countdown: ReturnType<typeof setInterval> | undefined;
  const update = () => {
    const pause = readHouseholdCalculationPause();
    if (pause.secondsRemaining > 0 && countdown === undefined) {
      countdown = setInterval(update, 1000);
    } else if (pause.secondsRemaining === 0 && countdown !== undefined) {
      clearInterval(countdown);
      countdown = undefined;
    }
    report(pause);
  };
  const stopListening = onHouseholdCalculationPause(update);
  // Read the pause now, not only when the caller first read it: a pause that
  // ended in between would otherwise stay on screen with no interval to end it.
  update();
  return () => {
    stopListening();
    if (countdown !== undefined) clearInterval(countdown);
  };
}

/**
 * The pause after a refusal for the firewall's limit, counted down once a
 * second while it runs.
 */
export function useHouseholdCalculationPause(): HouseholdCalculationPause {
  const [pause, setPause] = useState(readHouseholdCalculationPause);
  useEffect(() => watchHouseholdCalculationPause(setPause), []);
  return pause;
}
