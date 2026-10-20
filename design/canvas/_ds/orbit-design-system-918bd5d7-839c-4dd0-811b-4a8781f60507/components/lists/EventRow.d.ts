/** An event imported from a calendar outside Orbit: a time, a title, and the fact that it came from
 *  elsewhere. It sits in a well rather than a card, at --fg-2 with a --fg-3 calendar glyph, so it reads as
 *  context around the day rather than as one of the day's own objects.
 *
 *  IT IS NOT A HABIT ROW AND MUST NOT BE MISTAKEN FOR ONE. It never carries a status ring, it is never
 *  loggable, it has no completion of any kind, and it takes no overflow menu: Orbit does not own this
 *  object and cannot act on it. If something here needs to be logged, it is a habit and belongs in HabitRow.
 *  States: it has none of the nine. A row that only states a fact is not interactive, so there is no hover,
 *  focus, active, disabled, loading or error state; an empty day is the surface's EmptyState, and a failed
 *  import is the surface's ErrorState. */
interface EventRowBase {
  title: string;
  /** where it came from, e.g. the calendar's name. This is what stops it reading as an Orbit object. */
  source?: string;
}
export interface TimedEventRowProps extends EventRowBase {
  /** the event's time, mono and tabular */
  time: string;
  allDayLabel?: never;
}
export interface AllDayEventRowProps extends EventRowBase {
  time?: never;
  /** REQUIRED for an all-day event: what the time slot says, in the screen's locale (e.g. "dia inteiro" /
   *  "all day"). No default exists in either language. */
  allDayLabel: string;
}
/** Discriminated on `time`: an event either has a time or states, in the caller's words, that it has none. */
export type EventRowProps = TimedEventRowProps | AllDayEventRowProps;
export declare function EventRow(props: EventRowProps): any;
