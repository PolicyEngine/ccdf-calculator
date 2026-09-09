/**
 * Round tick values for a chart axis starting at zero. Recharts 2.x has no
 * `niceTicks` prop, so ticks are computed explicitly.
 */
export function niceTicks(dataMax: number, targetCount = 5): number[] {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return [0];
  const rawStep = dataMax / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let step: number;
  if (normalized <= 1) step = magnitude;
  else if (normalized <= 2) step = 2 * magnitude;
  else if (normalized <= 2.5) step = 2.5 * magnitude;
  else if (normalized <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const max = Math.ceil(dataMax / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 1000; value += step) {
    ticks.push(Math.round(value * 1e10) / 1e10);
  }
  return ticks;
}
