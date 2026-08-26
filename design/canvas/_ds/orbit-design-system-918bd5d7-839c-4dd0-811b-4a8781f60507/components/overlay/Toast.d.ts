/** The toast: PINNED CHROME, not an overlay. No scrim, nothing behind it is disabled, and it never waits
 *  for an answer. It lives in the shells' `notice` slot, directly above the composer - never in the
 *  composer's place, and never floating over content.
 *
 *  FOUR KINDS, DISCRIMINATED, because the real uses differ in what they are ALLOWED TO HAVE, not in how
 *  they look. Each capability a kind must not have is typed `never`, so misuse does not compile:
 *
 *    neutral  a fact the person may want to undo (a skipped row with its Undo). Optional ONE action.
 *             Never self-dismisses: `doneAfterMs`/`onDone` are never. No detail line, no status-bad.
 *    working  something is in flight (syncing). Draws the three-dot mark ITSELF - `icon` is never, so no
 *             caller passes a glyph. No action, no detail, never self-dismisses.
 *    done     a finished thing (synced). THE ONLY KIND THAT LEAVES ON ITS OWN: `onDone` fires after
 *             `doneAfterMs` (default 4000) and the caller unmounts it. It takes NO action, because a thing
 *             that finished has nothing to do. No detail line.
 *    lost     something was genuinely lost. REQUIRES `detail` (what was lost) AND `actionLabel`+`onAction`
 *             (the way back), all three, with no defaults - the type cannot construct a lost toast without
 *             them, because a toast that says a change was dropped and offers no way back is the worst
 *             state in the product, and prose has already lost twice in this project. Never self-dismisses.
 *             The ONLY kind that may carry --status-bad (its glyph).
 *
 *  Every word is the caller's, REQUIRED, no default in either language (the closed i18n audit's rule).
 *  Announcement: lost is assertive; the rest are polite. Dismissal of neutral/working/lost is the caller's
 *  state change (the fact resolved, the flight landed, the person acted) - never a timer. */
interface ToastBase {
  /** the one line, in the screen's locale. REQUIRED, no default. */
  message: string;
}
export interface NeutralToastProps extends ToastBase {
  kind?: 'neutral';
  /** the optional single action, e.g. Undo */
  actionLabel?: string;
  onAction?: () => void;
  /** Tabler name for the leading glyph; omit for none */
  icon?: string;
  detail?: never;
  doneAfterMs?: never;
  onDone?: never;
}
export interface WorkingToastProps extends ToastBase {
  kind: 'working';
  /** the component draws the three-dot mark itself */
  icon?: never;
  actionLabel?: never;
  onAction?: never;
  detail?: never;
  doneAfterMs?: never;
  onDone?: never;
}
export interface DoneToastProps extends ToastBase {
  kind: 'done';
  /** fired when the toast's time is up - the caller unmounts it. The only self-dismissal in the component. */
  onDone: () => void;
  /** ms before onDone, default 4000 */
  doneAfterMs?: number;
  /** Tabler name; defaults to the check */
  icon?: string;
  actionLabel?: never;
  onAction?: never;
  detail?: never;
}
export interface LostToastProps extends ToastBase {
  kind: 'lost';
  /** REQUIRED: what was lost, stated. No default. */
  detail: string;
  /** REQUIRED: the way back. No default. */
  actionLabel: string;
  onAction: () => void;
  /** Tabler name; defaults to alert-circle, in --status-bad - the only kind that may carry it */
  icon?: string;
  doneAfterMs?: never;
  onDone?: never;
}
/** Discriminated on `kind`: lost cannot be built without its detail and its action; the other three reject
 *  status-bad's glyph slot, the detail line and self-dismissal by type. */
export type ToastProps = NeutralToastProps | WorkingToastProps | DoneToastProps | LostToastProps;
export declare function Toast(props: ToastProps): any;
