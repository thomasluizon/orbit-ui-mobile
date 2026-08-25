/** The month's frame: a weekday header over a grid of DayCells. It owns the columns, the gaps and the
 *  header, and NOTHING about any day - a day's outcome, its counts and whether it can be logged all belong
 *  to DayCell.
 *
 *  THE WEEK START IS DATA, NEVER A CONSTANT. `weekdayLabels` is the caller's already-ordered list, so a
 *  Sunday-first and a Monday-first locale are the same component with different data. The grid takes its
 *  column count from that array's length and never assumes 7, and it hardcodes no weekday name in any
 *  language: a grid that knows the names knows the locale, which is the caller's to know.
 *  Leading and trailing blanks are DayCells with `outsideMonth`, so the grid never invents a cell type of
 *  its own and the shape holds without inventing days.
 *  States: it has none. The frame is not interactive; the loading state is Skeleton variant="grid" at the
 *  same `cols`, `cell` and `gap`, so nothing reflows when the days land. */
export interface MonthGridProps {
  /** the weekday initials ALREADY IN THE CALLER'S WEEK ORDER, e.g. ['D','S','T','Q','Q','S','S'] for a
   *  Sunday-first locale. Its length is the column count. Pass [] to render the grid with no header. */
  weekdayLabels?: string[];
  /** the DayCells, in order, including `outsideMonth` cells for the leading and trailing blanks */
  children?: any;
  /** the gap between cells, matched to the Skeleton grid that stands in for it. Default var(--s-2). */
  gap?: string | number;
  /** accessible name for the month, e.g. "Março de 2026" */
  label?: string;
}
export declare function MonthGrid(props: MonthGridProps): any;
