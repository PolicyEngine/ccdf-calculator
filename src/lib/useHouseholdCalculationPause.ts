import { useEffect, useState } from 'react';

import { householdCalculationPauseSeconds, onHouseholdCalculationPause } from './api';

/**
 * Whole seconds until the page may calculate again after a refusal for the
 * firewall's limit, 0 when it may now. Counts down once a second during a
 * pause.
 */
export function useHouseholdCalculationPause(): number {
  const [secondsRemaining, setSecondsRemaining] = useState(householdCalculationPauseSeconds);
  useEffect(() => {
    let countdown: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const seconds = householdCalculationPauseSeconds();
      setSecondsRemaining(seconds);
      if (seconds > 0 && countdown === undefined) {
        countdown = setInterval(update, 1000);
      } else if (seconds === 0 && countdown !== undefined) {
        clearInterval(countdown);
        countdown = undefined;
      }
    };
    // A pause that started before this effect ran.
    if (householdCalculationPauseSeconds() > 0) {
      countdown = setInterval(update, 1000);
    }
    const unsubscribe = onHouseholdCalculationPause(update);
    return () => {
      unsubscribe();
      if (countdown !== undefined) clearInterval(countdown);
    };
  }, []);
  return secondsRemaining;
}
