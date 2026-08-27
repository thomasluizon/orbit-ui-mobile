import type { ReactNode } from 'react'

export interface ShellWideItem {
  id: string
  label: string
  icon?: string
}

type ConversationSlot =
  | {
      conversation?: undefined
      conversationLabel?: never
    }
  | {
      conversation: ReactNode
      conversationLabel: string
    }

type CreateControl =
  | {
      onCreate?: undefined
      createLabel?: never
    }
  | {
      onCreate: () => void
      createLabel: string
    }

type PaletteControl =
  | {
      onPalette?: undefined
      paletteLabel?: never
      paletteHint?: never
    }
  | {
      onPalette: () => void
      paletteLabel: string
      paletteHint?: string
    }

interface ShellWideBase {
  children?: ReactNode
  header?: ReactNode
  notice?: ReactNode
  conversationOpen?: boolean
}

export type ShellWideNavProps = ShellWideBase &
  ConversationSlot &
  CreateControl &
  PaletteControl & {
    nav?: true
    items: ShellWideItem[]
    activeId: string
    onSelect?: (id: string) => void
    navLabel: string
    account?: string
    composer?: ReactNode
    action?: never
  }

export type ShellWideNoNavProps = ShellWideBase &
  ConversationSlot & {
    nav: false
    items?: never
    activeId?: never
    onSelect?: never
    onCreate?: never
    createLabel?: never
    account?: never
    onPalette?: never
    paletteLabel?: never
    paletteHint?: never
    navLabel?: never
    action?: ReactNode
    composer?: never
  }

export type ShellWideProps = ShellWideNavProps | ShellWideNoNavProps
