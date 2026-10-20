/** Bottom sheet on an OPAQUE #1C1C1E panel over a scrim. Content-height by default; exactly one scroll
 *  container (the body); the action row never scrolls. Position it inside a relatively-positioned shell.
 *
 *  A SHEET IS MOUNTED WHEN OPEN AND UNMOUNTED WHEN CLOSED. Its body therefore always opens at its first
 *  line, and a scroll position can never survive a close. A caller that keeps it mounted and toggles `open`
 *  reintroduces the exact defect this rule exists to close: an overlay opening scrolled away from its own
 *  first line, showing the middle of content the person has not read.
 *  So render it conditionally - `{open && <Sheet …/>}` - not permanently with a flag. `open` exists for the
 *  enter transition and for the one frame between the two, never as a visibility switch on a kept instance.
 *  THE TYPE NOW CARRIES THE RULE, because prose is what failed: `open` accepts only the literal `true`, so
 *  `open={false}` on a kept instance is a TYPE ERROR and the only way to hide a sheet is to unmount it. */
export interface SheetProps {
  /** ONLY the literal `true`, not boolean. A sheet on screen is open; a closed sheet is unmounted, so
   *  `open={false}` does not type-check and a kept-and-toggled instance is impossible to write. The prop
   *  survives for the enter transition. */
  open?: true;
  title?: string;
  /** action buttons; they hug their labels and sit trailing */
  actions?: any;
  onClose?: () => void;
  children?: any;
}
export declare function Sheet(props: SheetProps): any;
