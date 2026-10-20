/** One day in a month grid: the date, and how much of that day's schedule was completed.
 *
 *  FIVE OUTCOMES, and nothing between them. none | partial | full | not-scheduled | future. A day with
 *  nothing scheduled is NOT an empty day and never renders as one - it is a flat --bg-well disc with a
 *  dimmed numeral, because there was nothing to complete. An empty day is a day that had work and none was
 *  done. A FUTURE day is neither: it has not happened, so drawing it like not-scheduled would say "nothing
 *  was due" about a day whose dues have not arrived. It renders as a 1px --hairline-strong ring with the
 *  numeral at --fg-3 - visibly lighter than the missed track, visibly not the well disc. The cell has no
 *  clock: the CALLER decides which days are future and states it via `outcome="future"`.
 *
 *  THE ARC IS THE EXACT FRACTION. Pass `done` and `scheduled` and the arc sweeps done/scheduled with the
 *  outcome derived from them, so 1 of 4 and 3 of 4 cannot render alike. `scheduled: 0` is the not-scheduled
 *  outcome, decided before any fraction and read from `scheduled` alone. A hand-set `outcome` with no counts
 *  draws the extremes only; `outcome="future"` wins over counts, because a future day's counts are dues,
 *  not results.
 *
 *  THE WORDS ARE THE CALLER'S, and the prop is REQUIRED rather than optional with a Portuguese default, so
 *  a caller cannot forget and silently ship the wrong language. The cell hardcodes NO language: it composes
 *  "<label>, <outcome word> <done> <of> <scheduled>, <today>, <selected>, <read only>" entirely from
 *  `words`. One object per screen per locale. (This defect shipped once: the en pass announced Portuguese.)
 *
 *  LOGGABLE VERSUS READ ONLY IS IN THE TYPE. A loggable cell is a <button> requiring `onPress`; a read-only
 *  cell is a <div role="img"> typing `onPress` as never. A FUTURE day is never loggable - nothing has
 *  happened on it yet - so the loggable variant's `outcome` excludes 'future' at the type level.
 *
 *  SELECTION: the STATE is the screen's (which day the detail pane shows is view state, so the screen owns
 *  it and passes it down); the PRESENTATION is the cell's, via `selected`, so no screen ever wraps a cell to
 *  draw a ring it cannot draw itself. Selected = the accent ring plus the --bg-hover tint (the readme's
 *  "selected card tint+ring" accent role); today = the accent ring alone. The tint is what tells them apart
 *  when they are different days, and a cell that is both carries both words in its name.
 *  The accent enters at most three times, all sanctioned: the partial arc (progress), the today ring and
 *  the selected ring+tint (current position). full is --status-done, neutral: completion is never accent. */
export type DayOutcome = 'none' | 'partial' | 'full' | 'not-scheduled' | 'future';
/** Every word the cell can announce, supplied by the caller in the screen's locale. All required: a
 *  missing word is a silent wrong-language ship. */
export interface DayCellWords {
  none: string; partial: string; full: string;
  /** the not-scheduled outcome, e.g. "não programado" / "not scheduled" */
  notScheduled: string;
  /** the future outcome, e.g. "ainda por vir" / "upcoming" */
  future: string;
  /** joins the counts: "3 <of> 4", e.g. "de" / "of" */
  of: string;
  today: string; selected: string;
  /** announced on every read-only cell, e.g. "somente leitura" / "read only" */
  readOnly: string;
}
interface DayCellBase {
  /** the day of the month, 1-31 */
  day: number;
  /** completions on the day. With `scheduled`, drives BOTH the outcome and the arc's exact fraction. */
  done?: number;
  /** habits scheduled on the day. 0 means not-scheduled: nothing was due, so nothing was missed. */
  scheduled?: number;
  /** cell diameter in px, default 44 - the --touch-min floor. Never take a loggable cell below 44; a
   *  read-only cell may be smaller, but the two then stop matching in a grid that mixes them. */
  size?: number;
  /** today's cell: a 2px --primary ring, the accent as current position in TIME. At most one per grid. */
  today?: boolean;
  /** the day the screen is showing: accent ring + --bg-hover tint, the accent as current position of the
   *  VIEW. The state is the screen's; only the presentation lives here. At most one per grid. */
  selected?: boolean;
  /** a leading or trailing cell that keeps the grid's shape but belongs to another month: it occupies its
   *  box invisibly and is hidden from assistive tech. Never a clickable day. */
  outsideMonth?: boolean;
  /** the date in words for the accessible name, e.g. "12 de março" / "March 12" */
  label?: string;
  /** REQUIRED. The cell's entire vocabulary, in the screen's locale - no Portuguese default exists. */
  words: DayCellWords;
}
export interface LoggableDayCellProps extends DayCellBase {
  /** a day the person can still log: a real button, with a hover, a focus ring and a press scale. */
  loggable: true;
  /** a future day is NEVER loggable: nothing has happened on it yet, so the type excludes it here. */
  outcome?: Exclude<DayOutcome, 'future'>;
  /** REQUIRED when loggable. A loggable cell without a handler is a control that does nothing. */
  onPress: () => void;
}
export interface ReadOnlyDayCellProps extends DayCellBase {
  /** a day that can only be stated - outside the logging window, another month, or the future. */
  loggable?: false;
  outcome?: DayOutcome;
  /** read-only cells take NO handler: it could never fire, and a control that cannot be used is absent. */
  onPress?: never;
}
/** Discriminated on `loggable`: a read-only cell cannot be given `onPress`, a loggable one cannot omit it,
 *  and a loggable cell cannot be 'future'. */
export type DayCellProps = LoggableDayCellProps | ReadOnlyDayCellProps;
export declare function DayCell(props: DayCellProps): any;
