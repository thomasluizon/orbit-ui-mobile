/** The composer: Astra's front door, living in the shell on every primary screen. One input bar plus
 *  3 to 6 suggestion chips built from live state, so the chips take their labels as DATA and are never
 *  a fixed list. Astra is a layer, not a destination: there is no Astra tab and no bubble, and focusing
 *  this field is what opens the conversation (overlay at 412, side panel wide).
 *  The accent enters twice and only twice: the focus ring (current position) and the next action - the
 *  send button once there is something to send, or the STOP control while recording. Every other control
 *  on the bar (microphone, attach, the Astra glyph) is neutral at rest.
 *
 *  SENDING AND BUSY ARE DIFFERENT FACTS AND NEVER LOOK ALIKE. sending: the person's message was ACCEPTED
 *  and is in flight - accent send button, animated dots. busy: the concurrent chat limit is exactly one, so
 *  a second message is REFUSED, not accepted and not queued - the send control is inactive and NEUTRAL, and
 *  the refusal is stated inline. There is no queue and no draft buffer: nothing is held for later, and
 *  drawing busy like sending would tell the person their message was accepted when it was not.
 *
 *  THE WORDS ARE THE CALLER'S. `words` is REQUIRED with no default in either language: the composer's whole
 *  vocabulary - placeholders, control names, the busy and offline reasons - arrives per screen per locale,
 *  so an en screen cannot speak Portuguese by omission (the defect class DayCell shipped once).
 *
 *  atLimit states the ALLOWANCE ONLY. It carries no upgrade call to action, and it never states when the
 *  allowance returns: no endpoint returns that moment, so any component that asserted one would be
 *  instructing its caller to invent a value. `limitReason` is therefore REQUIRED when state is 'atLimit'
 *  and has NO DEFAULT, so nothing can render a fabricated return time by omission. */
/** The composer's whole vocabulary, caller-supplied per locale. Every key is required. */
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
   *  visible word inside the offline reason line, e.g. "Tentar de novo" */
  retry?: string;
}
/** The voice vocabulary. All four keys required; no default exists in either language. */
export interface ComposerVoiceWords {
  /** the microphone's accessible name, e.g. "Falar" */
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
/** VOICE. When `onVoice` is absent the microphone is ABSENT, not disabled - this system's rule for a
 *  control that cannot be used. When present, the microphone (neutral at rest) sits at the field's inline
 *  end before the send control, and `onVoice` toggles: press to start, press the stop control to stop.
 *  SPEAKING SPENDS NOTHING FROM THE DAILY ALLOWANCE: ChatController.cs:107 transcribes without calling
 *  TryConsumeAiMessage. Never write a cost line beside the microphone.
 *  `voiceWords` is REQUIRED with `onVoice` at the type level; without `onVoice` it is forbidden, and the
 *  'recording'/'transcribing' states are not constructible. */
export type ComposerVoice =
  | { onVoice: () => void; voiceWords: ComposerVoiceWords }
  | { onVoice?: never; voiceWords?: never };
/** ATTACHMENTS. When `onAttach` is absent both controls are ABSENT. When present, a file and an image
 *  control sit beside the microphone; both go unavailable in the 'offline' state, because that is what
 *  the app does (chat-composer-bar.tsx:390-402). A non-empty `attachments` draws a tray above the field:
 *  one row per attachment with its kind glyph, its name truncated, and a remove control firing
 *  `onAttachRemove(id)`. `attachWords` is REQUIRED with `onAttach` at the type level. `attachments`
 *  without `onAttach` is a TYPE ERROR: a tray a person cannot add to is a tray they cannot have filled. */
export type ComposerAttach =
  | { onAttach: (kind: 'file' | 'image') => void; attachWords: ComposerAttachWords; attachments?: ComposerAttachment[]; onAttachRemove?: (id: string) => void }
  | { onAttach?: never; attachWords?: never; attachments?: never; onAttachRemove?: never };
/** OFFLINE'S WAY BACK. `onRetry` is valid only in the 'offline' state (it renders nowhere else) and sits
 *  inside the offline reason line the component already draws. Passing it narrows `words` to require
 *  `retry`. */
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
