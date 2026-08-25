/** At-capacity notice: a boundary, not an error. Neutral tokens only, never --status-bad, and NO upgrade
 *  call to action. States the limit and the one action that changes it; pairs with a create control that is
 *  unavailable and carries its reason in visible text beside it.
 *  Two lines of text, with distinct jobs: `message` states the limit, and `body` explains it only when the
 *  limit is not self-evident. A body that restates the message is the defect - leave it out. */
export interface CapacityNoticeProps {
  /** the limit itself, in one line, e.g. "Limite de 10 hábitos. Arquive um hábito para criar outro." */
  message: string;
  /** the explanation, at --fg-3, ONLY where the limit is not self-evident: what the ceiling counts, or why
   *  it exists. Never a restatement of the message, and never an upsell. */
  body?: string;
  /** the one action that changes the limit, e.g. <Button size="sm" variant="ghost">Arquivar</Button> */
  action?: any;
}
export declare function CapacityNotice(props: CapacityNoticeProps): any;
