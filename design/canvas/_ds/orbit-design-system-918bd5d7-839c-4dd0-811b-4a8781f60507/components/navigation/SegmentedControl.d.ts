/** N options in a well, one selected. FOR VIEWS OF THE SAME THING ONLY: monthly against annual pricing of
 *  one plan, week against month of one chart. The options are presentations of one subject, so switching
 *  loses nothing and asks nothing.
 *  IT MUST NOT BE USED TO CHOOSE BETWEEN TWO DIFFERENT THINGS. Different destinations are tabs; different
 *  products are plan cards. If choosing has a consequence beyond presentation, this is the wrong control.
 *
 *  The selected option takes the TINT AND RING (--bg-hover + a 2px --primary inset ring), never a fill:
 *  a selected option is CURRENT POSITION, the accent's second role, and not an action. The accent's fill
 *  stays reserved for the one next action on the screen, so a filled segment would read as a button.
 *
 *  Every label is the caller's, in the screen's locale - the control ships no words. `label` (the group's
 *  accessible name) is REQUIRED for the same reason: no default exists to ship the wrong language.
 *  States: default · hover on unselected options · focus (accent ring, offset) · active (press scale) ·
 *  selected · disabled (whole control or per option, at .4) · loading, error, empty and at capacity do not
 *  apply: it opens knowing its options, and a control with under two options does not render. */
export interface SegmentedOption {
  id: string;
  /** the caller's word for this view, in the screen's locale */
  label: string;
  disabled?: boolean;
}
export interface SegmentedControlProps {
  /** 2 to 4 views of the same thing */
  options: SegmentedOption[];
  /** the selected option's id. REQUIRED: a segmented control always has a current position. */
  value: string;
  /** REQUIRED. Re-selecting the current option does not fire. */
  onChange: (id: string) => void;
  /** REQUIRED accessible name for the group, in the screen's locale */
  label: string;
  /** disable the whole control; per-option disabled lives on the option */
  disabled?: boolean;
}
export declare function SegmentedControl(props: SegmentedControlProps): any;
