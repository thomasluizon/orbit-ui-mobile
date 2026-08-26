/** A checklist row: the WHOLE ROW is the checkbox (role="checkbox" on the row, the 24px box drawn
 *  presentationally inside), so the hit target is the full row and never just the box.
 *  A ticked row dims its label to --fg-3. No strike-through, no accent, no colour change: completion is
 *  a neutral step down, and the accent stays on the screen's one filled action.
 *  Nine states: default · hover (--bg-hover, 380ms) · focus (inset accent ring) · active · checked ·
 *  disabled (.4 on the label, reason in `description`) · loading (the box spins while the tick is
 *  written; the row keeps its height) · error (--status-bad ring on the box + the fix under the label) ·
 *  empty is the list's, not the row's (EmptyState), and at capacity disables the add action (Actions). */
export interface CheckRowProps {
  label: string;
  /** quiet second line; a disabled row carries its reason here */
  description?: string;
  /** trailing mono value, e.g. a count */
  value?: string | number;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  /** error message; states the fix and replaces the description line */
  error?: string;
  id?: string;
}
export declare function CheckRow(props: CheckRowProps): any;
