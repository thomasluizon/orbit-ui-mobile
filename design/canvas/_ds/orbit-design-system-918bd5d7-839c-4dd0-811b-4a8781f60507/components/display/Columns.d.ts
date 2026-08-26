/** A set of labelled columns over a shared track: one column per NAMED CATEGORY, each filled to its share
 *  of the tallest column.
 *
 *  A COLUMN SET IS NOT A TIMELINE, and the type says so rather than a comment: every column is identified
 *  by an `id` and a `label`, and there is NO date, no start, no interval and no ordering prop anywhere in
 *  this component. It cannot be handed a time axis, so it cannot quietly become a chart whose gaps carry
 *  meaning. Columns sit side by side in the order given, evenly spaced, and a missing category is simply
 *  not passed - it leaves no hole, because there is no continuum for a hole to sit in. If the subject IS
 *  time, and a gap between two points means something, this is the wrong component: that needs an axis this
 *  one deliberately does not have.
 *
 *  The accent enters at most once, in its current-position role: `currentId` marks the column the person is
 *  in now. Every other column is neutral --fg-3, because a comparison is not a ranking and a taller column
 *  is not a better one.
 *  States: default · a zero column draws a 2px --status-empty sliver, so it reads as measured-and-zero
 *  rather than absent · all-zero announces `emptyLabel` per column instead of a figure, because a set with
 *  no data says so and never renders bars that look like real measurements · loading is
 *  Skeleton, error is the surface's, and the set is not interactive so it has no hover, focus or active. */
export interface Column {
  /** stable identity, e.g. a category key. NOT a date - this component has no time axis. */
  id: string;
  /** the category's name, shown under the column and used in its accessible name */
  label: string;
  /** the measured figure; 0 is a real measurement and draws the sliver */
  value: number;
}
export interface ColumnsProps {
  columns?: Column[];
  /** the value the tallest column represents. Omit and the tallest column in the set defines the top,
   *  which is right for a self-contained comparison; pass it to hold one scale across several sets. */
  max?: number;
  /** plot height in px, default 120 */
  height?: number;
  /** the column the person is in now: the accent, in its current-position role. At most one. */
  currentId?: string;
  /** show each figure above its column */
  showValues?: boolean;
  /** accessible name for the set */
  label?: string;
  /** REQUIRED: what an all-zero set announces per column, in the screen's locale (e.g. "sem dados" /
   *  "no data"). No default exists in either language. */
  emptyLabel: string;
}
export declare function Columns(props: ColumnsProps): any;
