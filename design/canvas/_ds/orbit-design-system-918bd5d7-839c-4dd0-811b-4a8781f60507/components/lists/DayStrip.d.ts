/** A row of day cells. TWO SCOPES, TWO VALUE UNIONS, and that separation is the point.
 *
 *  A freeze is stored as (UserId, UsedOnDate): it marks a DAY for the WHOLE ACCOUNT, never a habit. A
 *  snowflake inside one habit's strip would assert something the product cannot produce, so `frozen` is
 *  not in the habit union at all - passing it to scope="habit" is a TYPE ERROR, not a review note.
 *
 *  scope="habit"    the history of ONE habit: done | missed | not-scheduled.
 *  scope="account"  the person's streak: active | frozen | missed | today.
 *
 *  Cells are neutral except two: frozen carries IconSnowflake in --status-frozen (the neutral --fg-2),
 *  and today is the accent in its "current position" role - the only accent this component may use.
 *  done and active are the same filled --fg-1 disc: completion is never the accent. */
export type HabitDayValue = 'done' | 'missed' | 'not-scheduled';
export type AccountDayValue = 'active' | 'frozen' | 'missed' | 'today';
/** the strip's vocabulary, caller-supplied per locale. REQUIRED - no default in either language. */
export interface HabitDayWords { done: string; missed: string; notScheduled: string; }
export interface AccountDayWords { active: string; frozen: string; missed: string; today: string; }
interface DayStripBase {
  /** cells oldest-to-newest; when more than `length` are given, the LAST `length` render */
  length?: number;
  /** one accessible name per cell, index-aligned with the rendered cells (e.g. "seg 12"). Each cell is
   *  role="img" named "<label>, <state word>"; without labels a cell falls back to its bare index digit. */
  labels?: string[];
  /** cell edge in px, default 20 */
  size?: number;
  /** REQUIRED accessible name for the strip, in the screen's locale. No default exists. */
  label: string;
}
export interface HabitDayStripProps extends DayStripBase { scope: 'habit'; days: HabitDayValue[]; words: HabitDayWords; }
export interface AccountDayStripProps extends DayStripBase { scope: 'account'; days: AccountDayValue[]; words: AccountDayWords; }
/** Discriminated on `scope`: a habit strip cannot be given 'frozen', an account strip cannot be given
 *  'not-scheduled' - and each scope requires ITS words object, so a strip cannot announce the other scope's
 *  vocabulary or fall back to a language the caller never chose. */
export type DayStripProps = HabitDayStripProps | AccountDayStripProps;
export declare function DayStrip(props: DayStripProps): any;
