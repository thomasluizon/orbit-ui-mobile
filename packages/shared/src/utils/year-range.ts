const YEAR_RANGE_RADIUS = 12

/**
 * Builds a contiguous, ascending list of years centered on `centerYear`,
 * backing the compact year selector in the calendar header and date picker.
 * The span is fixed so the selected year always sits in the middle.
 */
export function buildYearRange(centerYear: number): number[] {
  const years: number[] = []
  for (
    let year = centerYear - YEAR_RANGE_RADIUS;
    year <= centerYear + YEAR_RANGE_RADIUS;
    year += 1
  ) {
    years.push(year)
  }
  return years
}
