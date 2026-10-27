
type NavHeaderBackVariant = {
  title: string
  titleVariant?: 'screen'
  onBack: () => void
  backLabel: string
  action?: React.ReactNode
}

type NavHeaderPlainVariant = {
  title: string
  titleVariant?: 'screen'
  onBack?: never
  backLabel?: never
  action?: React.ReactNode
}

export type NavHeaderProps = NavHeaderBackVariant | NavHeaderPlainVariant
