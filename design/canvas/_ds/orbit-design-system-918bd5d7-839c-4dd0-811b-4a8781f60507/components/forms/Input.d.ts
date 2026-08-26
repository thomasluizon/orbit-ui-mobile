/** Labelled text field, single line or multiline. Error is adjacent text plus a 2px ring, never a red
 *  border alone. The multiline field can show the words the schedule parser consumed, marked inside the
 *  person's own sentence: the marked text is drawn as the REAL content of the field's box and the
 *  transparent textarea is laid over it from inside the component, so mirror and field are ONE box from
 *  one style declaration and no caller can set one and not the other (the drift defect D71 names).
 *  caret-color stays --fg-1; the textarea's own colour goes transparent only while marks render. */
export interface InputBase {
  label?: string;
  /** error message; states the fix ("Use um email completo, como nome@exemplo.com") */
  error?: string;
  /** quiet mono hint under the field; a disabled field carries its reason here */
  hint?: string;
  /** optional node drawn INSIDE the field box at the inline end: --fg-3, centred; the text's end padding
   *  grows to clear it. With `multiline` it centres against the FIRST line, not the box - a glyph
   *  floating beside line three points at nothing. Decoration or an action, never a second label.
   *  aria-hidden unless the node is interactive. */
  trailing?: any;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  onChange?: (e: any) => void;
  /** hard character limit, valid with or without `multiline`. The app enforces one on the habit title
   *  today (MAX_HABIT_TITLE_LENGTH, apps/web/components/onboarding/onboarding-create-habit.tsx:182) and
   *  no drawing could say so. NO counter is drawn: the limit stops the typing, it does not annotate the
   *  field. */
  maxLength?: number;
}
/** marks without marksLabel is a TYPE ERROR: the mirror is aria-hidden, so without a name the marks
 *  exist for a sighted person and for nobody else. The component ships no words in either language. */
export type InputMarks =
  | {
      /** [start, end] character ranges into `value`, rendered as the marked word treatment: --bg-well
       *  behind the run, --r-chip, a 2px --hairline-strong underline. Ranges are the caller's data: a
       *  range past the end of `value` is CLAMPED, never thrown. */
      marks: Array<[number, number]>;
      /** the marks' accessible name, in the caller's locale, e.g. "Palavras que o Astra entendeu" /
       *  "Words Astra understood". Exposed to assistive tech with the marked words themselves. */
      marksLabel: string;
    }
  | { marks?: never; marksLabel?: never };
/** `multiline` is a true-only literal, the way Sheet.open is: multiline={false} is a type error and the
 *  single line field is the plain shape with no flag. `rows` and `marks` are valid ONLY with it - marks
 *  without multiline is a TYPE ERROR, not a warning (a single line field has no caller and the mirror
 *  needs the wrap). */
export type InputShape =
  | ({
      multiline: true;
      /** visible line count, default 3. Height is rows, never a pixel value, so the field grows with the
       *  type scale. NO autogrow: the field scrolls past `rows` - an autogrowing field inside a pinned
       *  shell slot moves the action under the person's thumb while they type. */
      rows?: number;
    } & InputMarks)
  | { multiline?: never; rows?: never; marks?: never; marksLabel?: never };
export type InputProps = InputBase & InputShape;
export declare function Input(props: InputProps): any;
