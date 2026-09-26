/**
 * of the tallest column. A COLUMN SET IS NOT A TIMELINE, and the type says so rather than a
 * comment: every column is identified by an `id` and a `label`, and there is NO date, no
 * start, no interval and no ordering prop anywhere in this component.
 */
export interface Column {
  /** stable identity, e.g. a category key. NOT a date - this component has no time axis. */
  id: string
  /** the category's name, shown under the column and used in its accessible name */
  label: string
  /** the measured figure; 0 is a real measurement and draws the sliver */
  value: number
}

export interface ColumnsProps {
  columns?: Column[]
  /** the value the tallest column represents. Omit and the tallest column in the set defines the top,
   * which is right for a self-contained comparison; pass it to hold one scale across several sets. */
  max?: number
  /** plot height in px, default 120 */
  height?: number
  /** the column the person is in now: the accent, in its current-position role. At most one. */
  currentId?: string
  /** show each figure above its column */
  showValues?: boolean
  /** accessible name for the set */
  label?: string
  /** REQUIRED: what an all-zero set announces per column, in the screen's locale (e.g. "sem dados" /
   * "no data"). No default exists in either language. */
  emptyLabel: string
}
