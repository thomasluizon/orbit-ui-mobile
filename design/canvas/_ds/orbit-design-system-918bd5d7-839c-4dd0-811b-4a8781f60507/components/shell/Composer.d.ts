/** One-line composer on Hoje and habit detail, and inside the conversation.
 * Minimum height 56 at rest: Astra glyph inside the leading edge on Hoje and habit detail,
 * input, one + menu control, filled send inside the trailing edge. The conversation omits the glyph.
 * Hoje suggestions live in the conversation; habit detail keeps 3 to 6 live chips in one scroll row.
 * App-authored labels never wrap or ellipsize. Input grows upward to five lines, then scrolls inside.
 * Attachments sit in a tray inside the container above the input. Recording replaces the input with
 * a timer and visible stop; transcribing uses a one-line status. Limit and offline reason and recovery
 * sit above the pill. Retry occupies the send position; sending shows progress. The top rule stays.
 * Closing the attach menu preserves the draft and attachments. */
export interface ComposerWords {
  /** the field's placeholder in resting/focused/composing/sending/busy, e.g. "Peça algo ao Astra" */
  placeholder: string;
  /** the field's placeholder when offline, e.g. "Sem conexão" */
  offlinePlaceholder: string;
  /** the field's placeholder at the allowance limit, e.g. "Sem mensagens hoje" */
  atLimitPlaceholder: string;
  /** the field's accessible name, e.g. "Falar com o Astra" */
  fieldLabel: string;
  /** the chip list's accessible name, e.g. "Sugestões do Astra" */
  chipsLabel: string;
  /** the head Astra-glyph button, e.g. "Abrir conversa" */
  open: string;
  /** the send control at rest, e.g. "Enviar" */
  send: string;
  /** the send control while sending, e.g. "Enviando" */
  sending: string;
  /** the send control while busy, e.g. "Aguarde a resposta" */
  waitReply: string;
  /** the inline refusal in busy: states there is no queue and no draft buffer */
  busyReason: string;
  /** the inline reason when offline */
  offlineReason: string;
  /** REQUIRED with `onRetry` (the pairing below narrows `words` to demand it): the retry control's
   *  visible word at the send position, e.g. "Tentar de novo" */
  retry?: string;
}
/** The voice vocabulary. All four keys required; no default exists in either language. */
export interface ComposerVoiceWords {
  /** the voice menu entry's accessible name, e.g. "Falar" */
  start: string;
  /** the stop control's accessible name, e.g. "Parar gravação" */
  stop: string;
  /** the visible word beside the running time while recording, e.g. "Ouvindo" */
  listening: string;
  /** the visible word that replaces the time while transcribing, e.g. "Transcrevendo" */
  transcribing: string;
}
/** The attachment vocabulary. All three keys required. `remove` takes the attachment's NAME and returns
 *  the remove control's accessible name (e.g. n => 'Remover ' + n): a row of identical remove buttons is
 *  not an accessible list. */
export interface ComposerAttachWords {
  file: string;
  image: string;
  remove: (name: string) => string;
}
export interface ComposerAttachment {
  id: string;
  kind: 'file' | 'image';
  name: string;
}
interface ComposerBase {
  /** 3 to 6 labels generated from live state. Anything past 6 is dropped. */
  chips?: string[];
  value?: string;
  /** REQUIRED: the composer's whole vocabulary, in the screen's locale. No default exists. */
  words: ComposerWords;
  onChipPress?: (chip: string, index: number) => void;
  onChange?: (value: string) => void;
  onSend?: () => void;
  /** focusing the field opens the conversation */
  onOpen?: () => void;
}
/** Voice starts from the + menu when onVoice is present. The recording stop remains visible
 * in the input area. voiceWords is required with onVoice; unavailable capabilities are absent. */
export type ComposerVoice =
  | { onVoice: () => void; voiceWords: ComposerVoiceWords }
  | { onVoice?: never; voiceWords?: never };
/** Photo and document entries share the + menu with voice; there are no separate inline
 * capability controls. Unavailable entries are absent, offline entries unavailable. attachWords is
 * required with onAttach. A non-empty tray holds one to three attachments, with a full-width name
 * wrapping to at most two lines before ellipsis and full text one tap away, plus a named remove action. */
export type ComposerAttach =
  | { onAttach: (kind: 'file' | 'image') => void; attachWords: ComposerAttachWords; attachments?: ComposerAttachment[]; onAttachRemove?: (id: string) => void }
  | { onAttach?: never; attachWords?: never; attachments?: never; onAttachRemove?: never };
/** Offline retry uses the send position. The reason remains above the pill.
 * Passing onRetry requires the caller's localized retry word. */
export type ComposerRetry =
  | { onRetry: () => void; words: ComposerWords & { retry: string } }
  | { onRetry?: never };
export interface ComposerAtLimitProps extends ComposerBase {
  state: 'atLimit';
  /** REQUIRED, no default. States the allowance and NOTHING else: no return moment (no endpoint returns
   *  one), no count the caller had to invent, no upsell. */
  limitReason: string;
}
export interface ComposerStateProps extends ComposerBase {
  /** resting | focused | composing | sending (accepted, in flight) | busy (refused, nothing queued) | offline */
  state?: 'resting' | 'focused' | 'composing' | 'sending' | 'busy' | 'offline';
  /** atLimit only - it cannot be passed in any other state */
  limitReason?: never;
}
/** The two voice states, constructible only with the voice pairing. recording: the field is replaced by
 *  the live recording row - a running time in mono tabular figures - and the stop control carries the
 *  accent, because stop is the next action. transcribing: the same row, the time replaced by the
 *  transcribing word, the stop control inactive and NEUTRAL - nothing is refused and nothing is being
 *  waited on by the person. */
export interface ComposerVoiceStateProps extends ComposerBase {
  state: 'recording' | 'transcribing';
  onVoice: () => void;
  voiceWords: ComposerVoiceWords;
  limitReason?: never;
}
/** Discriminated on `state`; the optional capabilities are their own pairings, so a caller without voice,
 *  attachments or retry passes nothing new and nothing about the component changes. */
export type ComposerProps = (ComposerAtLimitProps | ComposerStateProps | ComposerVoiceStateProps) & ComposerVoice & ComposerAttach & ComposerRetry;
export declare function Composer(props: ComposerProps): any;
