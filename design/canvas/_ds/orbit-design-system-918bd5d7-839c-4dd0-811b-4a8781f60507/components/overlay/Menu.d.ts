/** ONE overflow menu, TWO presentations - the same pattern the conversation already uses, where the
 *  feature is one thing and the width decides how it is shown:
 *    412  a bottom Sheet over the dimming scrim, 56px rows, reachable by thumb.
 *    wide an anchored popover on --bg-elev, sitting against the control that opened it, dismissed by an
 *         invisible catcher (nothing dims at this width) or Escape.
 *  Never a bottom sheet at the wide width, and never two components.
 *  A DESTRUCTIVE item is always separated by a hairline and always LAST, in --status-bad.
 *  Dismissal by scrim, catcher or Escape CHANGES NOTHING: only an item click calls onSelect.
 *  States: default · hover (--bg-hover) · focus (inset accent ring) · active · disabled per item (.4,
 *  and a disabled item stays visible so the menu does not reflow) · loading does not apply, a menu opens
 *  already knowing its items · empty is not a state: a control with no items does not open a menu ·
 *  at capacity belongs to the action the item triggers, not to the menu. */
export interface MenuItem {
  id: string;
  label: string;
  /** Tabler name */
  icon?: string;
  /** moves the item last, behind a separator, in --status-bad. Usually exactly one. */
  destructive?: boolean;
  disabled?: boolean;
  /** ONE short word at the row's inline end, rendered through the neutral Badge - e.g. 'Pro' on a
   *  plan-gated item ("Pro" is never translated). A badged item is a ROUTE, never a dead control: it
   *  stays a real button and fires onSelect so the caller can send the person to the gate - `disabled`
   *  is ignored when badge is present. Never the accent, never a second badge, never a leading badge. */
  badge?: string;
}
export interface MenuProps {
  /** present and true means open */
  open?: boolean;
  items?: MenuItem[];
  onSelect?: (id: string) => void;
  /** scrim, catcher and Escape all land here, and it must change nothing but the open flag */
  onClose?: () => void;
  /** the sheet's heading, and the popover's accessible name */
  title?: string;
  /** 'auto' (default) picks by viewport width; a screen inside the 412 shell passes 'sheet' explicitly */
  presentation?: 'auto' | 'sheet' | 'anchored';
  /** ref to the control that opened it; required for 'anchored'. The popover positions inside the nearest
   *  positioned ancestor (the shell), flipping above the control when it would overflow. */
  anchorRef?: any;
  /** which edge of the control the popover aligns to, default 'end' */
  align?: 'start' | 'end';
  /** viewport width at which 'auto' switches to anchored, default 900 */
  wideFrom?: number;
}
export declare function Menu(props: MenuProps): any;
