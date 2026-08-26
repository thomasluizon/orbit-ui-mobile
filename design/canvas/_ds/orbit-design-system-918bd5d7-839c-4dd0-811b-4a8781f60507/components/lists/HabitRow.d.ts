/** The canonical habit row. depth 0 is the top-level row (46px well, 17 title, 30 StatusRing) on its OWN panel; depth 1 is the sub-habit row (indented, 32px well, --fs-sm title in --fg-2, 24 StatusRing, compact height) - zero connector or tree lines; a family is one panel carrying the parent row and its sub rows. The body button's hit area is the well and the text ONLY: the trailing node (ring, control or caller node) is a SIBLING of the body button, never a child of it - a caller can never nest a control inside a button. The row suppresses its own hover while the pointer is on the log or menu button, so two surfaces never light at once. Log and menu keep 44px targets at every depth. */
export interface HabitRowBase {
  /** user-chosen emoji shown in the well (--bg-well, radius 12). OPTIONAL: when absent the component
   *  derives the fallback itself - the first letter of `title`, uppercased, in --fg-3 at 500 - so the
   *  well NEVER renders empty and a caller cannot produce a blank square. Pass no placeholder. */
  icon?: string;
  title: string;
  /** mono meta line, e.g. "08:00 · 12 dias" */
  meta?: string;
  /** see StatusRing. A freeze marks one calendar day, never a habit, so there is no 'frozen' here - and no 'skip'. */
  status?: 'empty' | 'done' | 'overdue' | 'bad';
  /** 0 = top-level habit (default, unchanged); 1 = sub-habit row */
  depth?: 0 | 1;
  /** 52px row without the well, for plain lists (depth 0 only) */
  compact?: boolean;
  /** opens the habit. The body is one button; the ring and the menu are their own. */
  onClick?: () => void;
}
/** The trailing slot is a three-way union, enforced in the type, not in prose:
 *  1. `trailing` replaces the ring (e.g. a mono value) and renders as a SIBLING of the body button.
 *     No ring means no ring words: statusLabel, onLog and logLabel are all forbidden.
 *  2. `onLog` makes the ring a CONTROL: a real 44px button, sibling of the body, same hover and
 *     focus-visible treatment as the overflow menu. The ring logs, the body opens. `logLabel` is
 *     REQUIRED with it - the button's accessible name, naming the ACTION and its direction in the
 *     screen's locale ("Registrar Caminhada", "Desfazer o registro de Caminhada"), so it changes with
 *     the status. The ring inside the button is decorative (aria-hidden): a control that names itself
 *     must not announce its status twice. statusLabel still describes the ring's state.
 *  3. Neither: the ring is a glyph, and `statusLabel` is its accessible name. */
export type HabitRowTrailing =
  | { trailing: any; statusLabel?: never; onLog?: never; logLabel?: never }
  | { trailing?: never; statusLabel: string; onLog: () => void; logLabel: string }
  | { trailing?: never; statusLabel: string; onLog?: never; logLabel?: never };
/** onMenu without menuLabel is a TYPE ERROR: the menu's accessible name is caller-supplied per locale,
 *  no default in either language. The menu button renders only when onMenu exists. */
export type HabitRowMenu =
  | { onMenu: () => void; menuLabel: string }
  | { onMenu?: never; menuLabel?: never };
export type HabitRowProps = HabitRowBase & HabitRowTrailing & HabitRowMenu;
export declare function HabitRow(props: HabitRowProps): any;
