/** A date shown, not edited: label plus value, NO control, no chevron, no hover, not focusable.
 *  This presentation is for read-only facts. Editable form dates use DateField, including recurring
 *  start anchors and task due dates. A moving next-due cursor never stands in for a start anchor.
 *  States: it has one. A read-only value has no hover, focus, active, disabled, loading or error state; if
 *  the value is not loaded yet the surrounding block shows its skeleton, and `value` is never a bare "0"
 *  or an empty string - pass the mono note instead. */
export interface DateRowProps {
  label: string;
  /** the formatted date, mono and tabular */
  value: string;
  /** quiet mono line under the row, for why it cannot change */
  note?: string;
}
export declare function DateRow(props: DateRowProps): any;
