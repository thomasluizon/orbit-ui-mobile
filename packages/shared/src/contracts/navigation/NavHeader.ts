
type NavHeaderBackVariant = {
  title: string
  onBack: () => void
  backLabel: string
  action?: React.ReactNode
}

type NavHeaderPlainVariant = {
  title: string
  onBack?: never
  backLabel?: never
  action?: React.ReactNode
}

export type NavHeaderProps = NavHeaderBackVariant | NavHeaderPlainVariant
