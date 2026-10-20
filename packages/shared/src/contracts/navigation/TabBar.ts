
export type TabBarItem = {
  id: string
  label: string
  icon?: (state: { active: boolean }) => React.ReactNode
}

export type TabBarProps = {
  items: readonly TabBarItem[]
  activeId: string
  onSelect: (id: string) => void
  label: string
}
