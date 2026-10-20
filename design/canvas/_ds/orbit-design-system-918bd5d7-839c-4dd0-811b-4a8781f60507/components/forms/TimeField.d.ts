/** A real time input, not a text box. Same 54px field, same accent focus ring and same error treatment as
 *  Input, so the two sit in one form without a seam.
 *  The VALUE is always 24-hour "HH:MM" - one wire format, whatever is displayed. `hourCycle` sets only the
 *  PRESENTATION, from the person's 12/24-hour setting: 'h23' (default) or 'h12'. Never store what was
 *  displayed, and never build a second field for the other cycle.
 *  States: default · hover (hairline one step) · focus (2px accent ring) · active (the picker open) ·
 *  disabled (.4 with its reason in `hint`) · error (2px --status-bad ring plus the fix) · empty (the
 *  browser's own --:-- placeholder) · loading does not apply, a field never spins · at capacity is the
 *  form's, in Actions. */
export interface TimeFieldProps {
  label?: string;
  /** 24-hour "HH:MM", always, regardless of hourCycle */
  value?: string;
  /** receives 24-hour "HH:MM" */
  onChange?: (value: string) => void;
  /** the person's clock setting: 'h23' 24-hour (default) or 'h12' */
  hourCycle?: 'h23' | 'h12';
  /** error message; states the fix */
  error?: string;
  /** quiet mono hint; a disabled field carries its reason here */
  hint?: string;
  disabled?: boolean;
  /** seconds granularity; 60 (default) hides the seconds field */
  step?: number;
  id?: string;
}
export declare function TimeField(props: TimeFieldProps): any;
