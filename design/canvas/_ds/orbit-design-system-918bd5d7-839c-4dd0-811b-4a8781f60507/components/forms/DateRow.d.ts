/** A date shown, not edited: label plus value, NO control, no chevron, no hover, not focusable.
 *  This is the presentation for a date the person cannot change - the start date, which is fixed when the
 *  habit is created and is NEVER the next due date (that one moves, and belongs to a row that can show it
 *  changing). If a date can be edited, this is the wrong component.
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
