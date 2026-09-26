
export interface SettingsGroupItem {
  label: string
  value?: string
  trailing?: React.ReactNode
  onClick?: () => void
}

export interface SettingsGroupProps {
  items: SettingsGroupItem[]
}
