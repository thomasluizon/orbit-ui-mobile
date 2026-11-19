
export interface EmptyStateProps {
  title: string
  /** The Orbit line under Orbit: one first-person sentence that names the state, such as offline or at the message limit. */
  line?: string
  action?: React.ReactElement
  disclosure?: React.ReactElement
  /** Orbit rests only where the AI is the missing part: an AI surface that is offline or at its message limit. */
  mascotState?: 'parado' | 'descansando'
}
