/**
 * Semantic-version comparison for policyengine-us build numbers.
 *
 * The live API and the precomputed grid run different policyengine-us
 * versions, and the API usually lags. Comparing the strings lexically is
 * wrong ("1.764.6" sorts after "1.824.7"), so compare the numeric parts.
 */

/** Parsed `major.minor.patch`, ignoring any pre-release or build suffix. */
function parse(version: string): number[] | null {
  const match = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version ?? '');
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/**
 * `-1` when `a` is older than `b`, `1` when newer, `0` when equal, and
 * `null` when either version cannot be parsed (for example the API metadata
 * reported `unknown`).
 */
export function compareVersions(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** True only when both versions parse and `candidate` is the older one. */
export function isOlderThan(candidate: string | null, reference: string | null): boolean {
  return compareVersions(candidate, reference) === -1;
}
