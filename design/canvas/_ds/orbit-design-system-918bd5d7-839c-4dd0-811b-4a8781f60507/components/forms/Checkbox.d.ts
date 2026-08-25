/** 24px checkbox. Checked is a FILLED --fg-1 box with a Tabler check in --bg: neutral, never the accent,
 *  because a ticked item is a completion and the accent never marks completion.
 *  Nine states: default · hover (surface + hairline one step) · focus (2px accent ring, offset 2) ·
 *  active (scale .96) · checked · disabled (.4, reason lives on the row) · loading (a 16px spinner in the
 *  box, holding its 24px footprint, for a tick being written) · error (2px --status-bad ring, message on
 *  the row) · empty and at-capacity are not a control's states: an empty checklist is EmptyState, and a
 *  full one disables its create action (see Actions). */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** draws the --status-bad ring; the message belongs beside the row, never inside the box */
  error?: boolean;
  /** the tick is being written; the box holds its size and ignores clicks */
  loading?: boolean;
  /** inline label to the right; omit when a row owns the label */
  label?: string;
  id?: string;
  /** 'span' renders the box PRESENTATIONALLY for a parent that is itself the control (CheckRow does this).
   *  Never 'span' on its own - it has no keyboard behaviour. */
  as?: 'button' | 'span';
}
export declare function Checkbox(props: CheckboxProps): any;
