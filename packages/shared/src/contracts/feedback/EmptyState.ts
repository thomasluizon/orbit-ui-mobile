
export interface EmptyStateProps {
  title: string
  action?: React.ReactElement
  disclosure?: React.ReactElement
  /** Orbit rests only where the AI is the missing part: an AI surface that is offline or at its message limit. */
  mascotState?: 'parado' | 'descansando'
}
