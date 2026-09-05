import type { ReactNode } from 'react'

export type TabBarItem = {
  id: string
  label: string
  icon?: (state: { active: boolean }) => ReactNode
}

export type TabBarProps = {
  items: readonly TabBarItem[]
  activeId: string
  onSelect: (id: string) => void
  label: string
}
