export const TAB_BAR_LABEL_MAX_FONT_SCALE = 1.25

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
