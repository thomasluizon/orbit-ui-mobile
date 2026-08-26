/** General list row: 24 icon in a 28px slot, title 17/400, description 14 in --fg-3, mono value, trailing
 *  24 chevron in --fg-4. Draws NO rule of its own; separation is the container's job. The row body is one
 *  button; `action` (when present) and the chevron are its siblings, so a control never nests in a button. */
export interface ListRowBase {
  /** Tabler icon name */
  icon?: string;
  title: string;
  description?: string;
  /** text only. A control-shaped thing (a ring, a badge) does NOT go here - that is what `trailing` is for. */
  value?: string;
  /** THE TRAILING SLOT, after the value and before the chevron. ListRow owns it (not DayCell): the case is
   *  a row about a day carrying its StatusRing, and the ring is the row's passenger, not the cell's. It
   *  takes a status-shaped NODE (StatusRing, Badge) and never an interactive control - the row itself is
   *  the control, and a second control inside it splits the hit target. A per-row control is `action`. */
  trailing?: any;
  /** destructive row: title and icon in --status-bad */
  danger?: boolean;
  /** hide the trailing chevron */
  chevron?: boolean;
  onClick?: () => void;
}
/** The per-row action: a real 44px button, SIBLING of the row body, after `trailing` and before the
 *  chevron, with the same hover, press and focus-visible treatment HabitRow's menu button has. The row
 *  suppresses its own hover while the pointer is on it. `label` is required by this type: an icon button
 *  with no accessible name cannot be constructed. `danger` puts the icon in --status-bad, for a delete. */
export interface ListRowAction {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}
/** `readOnly` with `action` is a TYPE ERROR: readOnly means the row states something and cannot be acted
 *  on - it renders as a div, no chevron, no hover, no focus ring, not in the tab order, and NO CONTROL AT
 *  ALL rather than a disabled one. An action beside it contradicts the only thing readOnly says.
 *  This is the row for a day that cannot be logged. Do not reach for CheckRow with everything switched
 *  off - that still draws a box, and the box is the thing that is not there. */
export type ListRowMode =
  | { readOnly: true; action?: never }
  | { readOnly?: false; action?: ListRowAction };
export type ListRowProps = ListRowBase & ListRowMode;
export declare function ListRow(props: ListRowProps): any;
