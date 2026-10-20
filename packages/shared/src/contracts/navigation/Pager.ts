
type PagerBase = {
  index: number
  count: number
  label: string
  backLabel: string
  onBack?: () => void
}

type PagerOwnForward = PagerBase & {
  forwardLabel: string
  onForward?: () => void
  forwardSlot?: never
}

type PagerReplacedForward = PagerBase & {
  forwardSlot: React.ReactNode
  forwardLabel?: never
  onForward?: never
}

export type PagerProps = PagerOwnForward | PagerReplacedForward
