import type { ReactNode } from 'react'

export interface SettingsGroupItem {
  label: string
  value?: string
  trailing?: ReactNode
  onClick?: () => void
}

export interface SettingsGroupProps {
  items: SettingsGroupItem[]
}
