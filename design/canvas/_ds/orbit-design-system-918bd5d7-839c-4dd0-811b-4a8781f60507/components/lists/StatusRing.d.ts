/** Habit status indicator: ONE shape. Not filled = a 2px inset ring in the state colour with NOTHING inside it; filled = a solid disc plus a check. Only done fills here. overdue and bad are hollow rings in their own colour, empty middle - no glyph, no emoji, no punctuation ever sits inside a ring.
 * This component is colour and shape ONLY. A caller using overdue or bad MUST also state the status in words on the row (the meta strip, e.g. "18:30 · atrasado") - the word is the non-colour carrier; the ring alone never carries those states.
 * A freeze marks one calendar day for one user. It holds the streak on a day the person missed. It is never a property of a habit - so there is no frozen status here, and no skip status either. The day-scoped frozen treatment (IconSnowflake in --status-frozen) belongs to the streak day strip, where a day is the subject. */
export interface StatusRingProps {
  /** empty = bare --status-empty ring · done = filled --fg-1 disc + IconCheck · overdue = hollow 2px ring in --status-overdue, nothing inside · bad = hollow 2px ring in --status-bad, nothing inside */
  status?: 'empty' | 'done' | 'overdue' | 'bad';
  /** diameter in px, default 30 */
  size?: number;
  /** REQUIRED: the accessible name for the CURRENT status, in the screen's locale (e.g. "concluído" /
   *  "done"). No default exists in either language - a default a caller can omit is how the wrong language
   *  ships unnoticed. */
  label: string;
}
export declare function StatusRing(props: StatusRingProps): any;
