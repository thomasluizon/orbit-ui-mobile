export interface InsightsHeadlineProps {
  /** The latest value, already formatted with its unit. */
  value: string
  /** The change versus the start of the range, already formatted (absolute). */
  delta?: string
  direction?: 'up' | 'down'
  /** Optional qualifier rendered as a meta line under the value (e.g. "avg"). */
  caption?: string
}

/**
 * Derives the latest value and the change versus the first point of a series,
 * each pre-formatted, for an {@link InsightsHeadline}. Returns null for an empty
 * series and omits the delta when it is flat or there is a single point.
 */
export function trendHeadline(
  points: ReadonlyArray<{ value: number }>,
  formatValue: (value: number) => string,
): InsightsHeadlineProps | null {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return null
  const diff = last.value - first.value
  if (points.length < 2 || diff === 0) {
    return { value: formatValue(last.value) }
  }
  return {
    value: formatValue(last.value),
    delta: formatValue(Math.abs(diff)),
    direction: diff > 0 ? 'up' : 'down',
  }
}
