
export interface MenuItem {
  id: string
  label: string
  icon?: string
  destructive?: boolean
  /** Present for a toggle item; exposes its selected state without changing selection on dismissal. */
  checked?: boolean
  disabled?: boolean
  badge?: string
}

interface MenuBaseProps {
  id?: string
  open?: boolean
  items?: readonly MenuItem[]
  onSelect?: (id: string) => void
  onClose?: () => void
  title?: string
  align?: 'start' | 'end'
}

export interface AutomaticMenuProps extends MenuBaseProps {
  presentation?: 'auto'
  anchorRef?: React.RefObject<unknown>
  wideFrom?: number
}

export interface SheetMenuProps extends MenuBaseProps {
  presentation: 'sheet'
  anchorRef?: never
  wideFrom?: never
}

export interface AnchoredMenuProps extends MenuBaseProps {
  presentation: 'anchored'
  anchorRef: React.RefObject<unknown>
  wideFrom?: never
}

/** One menu with a presentation discriminated by width or by the explicit presentation override. */
export type MenuProps = AutomaticMenuProps | SheetMenuProps | AnchoredMenuProps
