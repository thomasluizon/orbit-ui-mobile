/** One-time-code cells: 44x56, mono digits, the active cell carrying the accent ring and a blinking caret.
 *
 *  THE COMPONENT OWNS THE TYPING, and the type makes it impossible to compose it beside the component.
 *  One real input spans the cells, so the browser's own behaviour arrives for free and is never
 *  reimplemented: caret position, backspace across cells, autofill from a message (autocomplete=
 *  "one-time-code"), and PASTING A WHOLE CODE, which the component strips to digits and truncates to
 *  `length` itself. There are no per-cell inputs and no key handler for a caller to write.
 *  `onChange` is REQUIRED, not optional: a caller that passes only `value` has built a field that cannot be
 *  typed into, and that is now a type error rather than a review note. There is no `activeIndex` prop at
 *  all - the active cell is derived from the value's length, so a caller cannot track a cursor beside the
 *  component and cannot drift out of step with it.
 *  States: default · focus (accent ring + caret on the active cell) · filled · disabled (.4, reason in
 *  `hint`) · error (every cell takes the --status-bad ring, because the CODE is wrong, not one digit) ·
 *  empty is the resting state · loading does not apply, a field never spins · at capacity is the form's. */
export interface OtpInputProps {
  /** how many cells, default 6 */
  length?: number;
  /** the digits entered so far. Non-digits and anything past `length` are dropped by the component. */
  value: string;
  /** REQUIRED. Receives the digits-only value on typing, deleting, autofill and paste alike. */
  onChange: (value: string) => void;
  /** fired once the value reaches `length`, for a caller that submits automatically */
  onComplete?: (value: string) => void;
  /** error message; states the fix. Rings every cell, since a wrong code is wrong as a whole. */
  error?: string;
  /** quiet mono hint; a disabled field carries its reason here */
  hint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** REQUIRED: the field's accessible name, in the screen's locale (e.g. "Código" / "Code").
   *  No default exists in either language. */
  label: string;
  id?: string;
}
export declare function OtpInput(props: OtpInputProps): any;
