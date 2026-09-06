import type { ReactNode } from 'react'

type NavHeaderBackVariant = {
  title: string
  onBack: () => void
  backLabel: string
  action?: ReactNode
}

type NavHeaderPlainVariant = {
  title: string
  onBack?: never
  backLabel?: never
  action?: ReactNode
}

export type NavHeaderProps = NavHeaderBackVariant | NavHeaderPlainVariant
