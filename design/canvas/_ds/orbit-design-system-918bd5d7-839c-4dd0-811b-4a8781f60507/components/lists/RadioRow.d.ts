/** The system's ONE single-choice row - goals, themes, move targets. A single choice is always this
 * component; a second single-choice row is a defect. Selected = rgba(var(--primary-rgb),.10) fill +
 * inset 1.5px --primary ring at --r-well, and the 24px radio glyph fills accent with a 9px dot - the
 * glyph stays the only accent-FILLED mark on the row. Wrap a group in role="radiogroup".
 * NO dashed border on any row: inset dashed hairline means `proposed` (an inferred value), and a
 * destination the person picks by hand is not one. A root/"top level" row is distinct by its Home
 * glyph, its position, and its words - that is enough. */
export interface RadioRowBase {
  label: string;
  description?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** optional node in a 30x30 slot before the body, radius --r-well. The slot draws NO background of
   *  its own - the caller styles what it puts inside: a habit emoji sits in a --bg-well square; a
   *  "top level" Home glyph sits in a transparent square with a 1px inset hairline. */
  leading?: any;
  /** indent level, default 0. Inline-start padding grows by depth * 20px on top of --pad-row;
   *  description and reason indent with the label. */
  depth?: number;
  /** short value at the end of the label line: --font-mono, --fs-xs, --fg-3, tabular-nums. Carries a
   *  count of selectable children. Sits before the radio glyph; never wraps. */
  meta?: string;
  /** ONE uppercase word: --font-sans 600, --track-label, --fg-3, no box, no fill. The habit's current
   *  parent says so on its own row. Sits after meta, before the glyph. Caller-supplied per locale. */
  tag?: string;
}
/** disabled without reason is a TYPE ERROR: a refused choice that does not say why is the defect.
 *  A disabled row is opacity .5, a div (not a button), no hover, no focus; reason renders under the
 *  label at --fs-xs / --fg-3 / line-height 1.4, indented to match depth. It keeps leading, meta, tag. */
export type RadioRowDisabled =
  | { disabled: true; reason: string }
  | { disabled?: false; reason?: never };
export type RadioRowProps = RadioRowBase & RadioRowDisabled;
export declare function RadioRow(props: RadioRowProps): any;
