/** The container every generative block inherits, so the rules are enforced once rather than per block.
 *  Header (Astra glyph + title + count + a risk slot), a scrolling body of items, a stale banner, and an
 *  action row that NEVER scrolls with the body: the accept and the cancel stay reachable no matter how long
 *  the list is.
 *  Five states: loading (skeleton shaped like the final rows, never a spinner), resting, acting,
 *  partiallyFailed, stale.
 *  Rules it carries: one batch preview, per-item edit, ONE accept. Text streams and the block arrives
 *  whole, so the block's own reveal is never animated. A stale block says so rather than acting on old
 *  state. The aria-live region is scoped to the body, so announcements stay card-scoped.
 *  A BLOCK IS AUTHORED THROUGH THESE PROPS, never against the frame's class names: a row that needs its own
 *  control takes `control`, a row the machine proposed takes `proposed`, a row whose action cannot be
 *  undone takes `irreversible`. If a block reaches for .item or .st, the frame is being worked around. */
export interface BlockFrameItem {
  label: string;
  /** tabular meta, e.g. a count or a time */
  meta?: string;
  /** THE ROW'S OWN CONTROL, at the trailing edge before the status glyph: a habit row's logging ring, a
   *  breakdown row's frequency pill. Any node. This is what stops a block reaching around the frame. */
  control?: any;
  /** the machine proposed this row and the person has not accepted it: the row renders through Proposed
   *  (scope="row"), so it sits at --fg-3 inside an inset dashed hairline and NEVER takes the accent.
   *  This is the tenth state, and it stays one implementation - the frame delegates to that component. */
  proposed?: boolean;
  /** this row's action cannot be undone. The row carries the irreversible mark, and the frame's action row
   *  states that the accept asks for confirmation.
   *  CONFIRMATION IS DECIDED BY REVERSIBILITY, NEVER BY ITEM COUNT: a batch of reversible rows and a batch
   *  holding one irreversible row must not look identical, and a large reversible batch asks for nothing. */
  irreversible?: boolean;
  /** absent = pending and editable. done | acting | failed drive the per-row glyph. */
  status?: 'done' | 'acting' | 'failed';
  /** the accessible name for the status glyph, e.g. "Falhou" */
  statusLabel?: string;
}
interface BlockFrameBase {
  title: string;
  /** tabular count in the header, e.g. 4 */
  count?: number;
  items?: BlockFrameItem[];
  /** the pinned action row. ONE accept, plus a cancel or a retry. Never one button per item. */
  actions?: any;
  /** THE RISK SLOT, in the header beside the count. Takes a node - a Badge carrying the operation's risk
   *  class (Low, Destructive, High) - so the class is never redrawn per block. The frame owns the placement
   *  and nothing else: it does not map an outcome to a colour, because the five typed outcomes
   *  (PendingConfirmation, StepUp, Denied, UnsupportedByPolicy, Succeeded) are the block's CONTENT, and the
   *  risk class is a property of the operation. */
  risk?: any;
  skeletonRows?: number;
  /** the neutral outline mark on an irreversible row (e.g. "DEFINITIVO" / "PERMANENT"). REQUIRED whenever
   *  any item is irreversible - runtime-enforced, because it depends on the items array's values, which a
   *  type cannot see. No default exists in either language. */
  irreversibleLabel?: string;
  /** the action-row line when ANY row is irreversible. Says confirmation exists; never a count. REQUIRED
   *  with an irreversible item - runtime-enforced, same reason. No default exists. */
  confirmNote?: string;
  /** the proposed rows' accessible name (passed to Proposed). REQUIRED whenever any item is proposed -
   *  runtime-enforced, same reason. No default exists. */
  proposedLabel?: string;
}
/** staleMessage exists exactly where the stale state does - a stale block cannot render without its words,
 *  and no other state can carry them. Names the circumstance, never the person. */
type BlockFrameStale =
  | { state: 'stale'; staleMessage: string }
  | { state?: 'loading' | 'resting' | 'acting' | 'partiallyFailed'; staleMessage?: never };
/** editLabel exists exactly where per-item edit does. */
type BlockFrameEdit =
  | { onEditItem: (item: BlockFrameItem, index: number) => void; editLabel: string }
  | { onEditItem?: never; editLabel?: never };
export type BlockFrameProps = BlockFrameBase & BlockFrameStale & BlockFrameEdit;
export declare function BlockFrame(props: BlockFrameProps): any;
