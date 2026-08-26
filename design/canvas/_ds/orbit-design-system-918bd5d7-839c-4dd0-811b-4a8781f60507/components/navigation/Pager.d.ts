/** Step indicator plus the two controls that move between steps: segments showing where the person is, a
 *  back control, and a forward control. One component so a flow never hand-builds its own footer.
 *
 *  IT NEVER ADVANCES ITSELF. Every move is the caller's, through `onBack` and `onForward`: nothing here fires
 *  on a timer, on a completed field, or on a valid answer. A flow that advances on its own takes the step
 *  away from the person mid-read and cannot be gone back through reliably.
 *
 *  ON THE LAST PAGE THE FORWARD CONTROL IS REPLACED, NOT RELABELLED. `forwardSlot` renders in its place
 *  when `index` is the last index, so the closing action is the flow's own button - a submit, a create, a
 *  confirm - carrying its own label, its own loading state and its own disabled reason. A relabelled
 *  "Continuar" cannot say it is submitting, and a flow that fakes it ends up rebuilding this footer.
 *  The accent enters once: the current segment and the forward control are the same next-action role, and
 *  the closing action in `forwardSlot` inherits it as the one filled button on the page.
 *  States: default · back is unavailable on the first page (there is nowhere behind it) · forward is
 *  unavailable until the caller passes a handler, so a step that is not answered yet simply has none ·
 *  hover, focus and active belong to the controls · loading belongs to the closing action, never to the
 *  segments · error is the step's content, never the pager's. */
export interface PagerProps {
  /** how many steps. The segment count, and what the last index is measured against. */
  count: number;
  /** the current step, 0-based. Past segments are --fg-3, the current one is --primary, the rest are the
   *  dimmed --status-empty track. */
  index?: number;
  /** move back one step. Omit it, or sit on the first page, and the back control is unavailable. */
  onBack?: () => void;
  /** move forward one step. Omit it and forward is unavailable - which is how a step that is not answered
   *  yet blocks the flow, without the pager knowing anything about the step's content. */
  onForward?: () => void;
  /** THE CLOSING ACTION, rendered INSTEAD OF the forward control on the last page. Pass the flow's own
   *  button so it carries its own label, loading state and disabled reason. Never a relabelled forward. */
  forwardSlot?: any;
  /** replace the default back control entirely (rare; the default is a ghost button) */
  back?: any;
  /** replace the default forward control on non-last pages (rare) */
  forward?: any;
  /** REQUIRED: the back control's label, in the screen's locale. No default exists in either language. */
  backLabel: string;
  /** REQUIRED: the forward control's label. Unused on the last page, where `forwardSlot` replaces forward. */
  forwardLabel: string;
  /** the mono "n/total" between the controls, default true */
  showCount?: boolean;
  /** REQUIRED accessible name for the segment group, in the screen's locale. No default exists. */
  label: string;
}
export declare function Pager(props: PagerProps): any;
