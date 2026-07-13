/**
 * Compares two semver-ish version strings by their numeric
 * `major.minor.patch` portion. Non-numeric suffixes (`-beta`, `-rc1`) are
 * ignored and missing segments are treated as `0`.
 *
 * Returns `true` only when `current` can be proven strictly older than
 * `minimum`. Equal, newer, or unparseable `current` all return `false`
 * (fail-safe allow) so a version that cannot be judged is never blocked.
 */
export function isVersionBelow(current: string, minimum: string): boolean {
  const currentParts = normalizeVersion(current)
  if (currentParts === null) return false

  const minimumParts = normalizeVersion(minimum) ?? [0]
  const length = Math.max(currentParts.length, minimumParts.length)
  for (let i = 0; i < length; i++) {
    const currentSegment = currentParts[i] ?? 0
    const minimumSegment = minimumParts[i] ?? 0
    if (currentSegment < minimumSegment) return true
    if (currentSegment > minimumSegment) return false
  }
  return false
}

function normalizeVersion(version: string): number[] | null {
  const numeric = version.split(/[^0-9.]/)[0] ?? ''
  if (!/\d/.test(numeric)) return null
  return numeric
    .split('.')
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })
}
