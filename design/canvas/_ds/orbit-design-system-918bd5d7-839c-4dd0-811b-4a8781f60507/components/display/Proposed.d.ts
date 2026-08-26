/** The tenth state. Its job: show that the machine suggested this and the person has not accepted it yet.
 *  Wraps a field, a list row or a whole block and renders the normal component at --fg-3 with an inset
 *  dashed hairline. It resolves to the normal component the instant the person accepts or edits, which is
 *  `proposed={false}` returning the child untouched.
 *  It NEVER takes the accent, because a proposal is not what is next.
 *  A DERIVED value is not a proposed value: a derived value renders like a typed one, carries no edit
 *  control, and the surface names what it derives from. Never wrap a derived value in this. */
export interface ProposedProps {
  children: any;
  /** which radius the dashed hairline follows: field 12, row 8, block 20 */
  scope?: 'field' | 'row' | 'block';
  /** false returns the child with no treatment at all */
  proposed?: boolean;
  /** REQUIRED: the proposed state's accessible name, in the screen's locale (e.g. "Proposto pelo Astra" /
   *  "Proposed by Astra"). No default exists in either language. */
  label: string;
}
export declare function Proposed(props: ProposedProps): any;
