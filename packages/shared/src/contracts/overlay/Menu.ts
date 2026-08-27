import type { RefObject } from 'react'

export interface MenuItem {
  id: string
  label: string
  icon?: string
  destructive?: boolean
  disabled?: boolean
  badge?: string
}

interface MenuBaseProps {
  open?: boolean
  items?: readonly MenuItem[]
  onSelect?: (id: string) => void
  onClose?: () => void
  title?: string
  align?: 'start' | 'end'
}

export interface AutomaticMenuProps extends MenuBaseProps {
  presentation?: 'auto'
  anchorRef?: RefObject<unknown>
  wideFrom?: number
}

export interface SheetMenuProps extends MenuBaseProps {
  presentation: 'sheet'
  anchorRef?: never
  wideFrom?: never
}

export interface AnchoredMenuProps extends MenuBaseProps {
  presentation: 'anchored'
  anchorRef: RefObject<unknown>
  wideFrom?: never
}

/** One menu with a presentation discriminated by width or by the explicit presentation override. */
export type MenuProps = AutomaticMenuProps | SheetMenuProps | AnchoredMenuProps
