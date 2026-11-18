
export interface CapacityNoticeProps {
  message: string
  body?: string
  action?: React.ReactElement
  /** Orbit rests beside the message only where the AI is the missing part: an AI surface at its message limit or
   *  offline. A boundary on a surface that still works without the AI carries no mascot. */
  mascotState?: 'descansando'
}
