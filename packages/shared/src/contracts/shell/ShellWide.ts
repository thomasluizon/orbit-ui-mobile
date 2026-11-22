
/** One sidebar destination. A destination with no id or no label does not compile. */
export interface ShellWideItem {
  id: string
  label: string
  icon?: string
}

type ConversationSlot =
  | {
      conversation?: undefined
      conversationOpen?: never
      conversationLabel?: never
    }
  | {
      conversation: React.ReactNode
      conversationOpen?: boolean
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
  children?: React.ReactNode
  header?: React.ReactNode
  notice?: React.ReactNode
}

/** A destination: the sidebar is present, and the pinned bottom slot of the 740 column is the
 *  composer. `items` and `activeId` stay required, because a sidebar with no destinations and a nav
 *  with no current position are not states. */
export type ShellWideNavProps = ShellWideBase &
  ConversationSlot &
  CreateControl &
  PaletteControl & {
    nav?: true
    /** Four destinations, never five. */
    items: ShellWideItem[]
    activeId: string
    orbitRow: { label: string; onOpen: () => void }
    onSelect?: (id: string) => void
    /** The nav landmark's accessible name, in the screen's locale. */
    navLabel: string
    /** The account row at the foot of the sidebar. */
    account?: string
    accountEmail?: string
    notifications?: React.ReactNode
    /** Habit detail composer at every width or Hoje selection tray.
     *  Resting Hoje has no bottom content. Transient chrome uses `notice`. */
    composer?: React.ReactNode
    /** Rejected on a destination: a flow's forward action exists only where `nav` is false. */
    action?: never
  }

/** A flow: no sidebar at all, not a disabled one and not an empty one. Every sidebar prop is
 *  rejected, because each renders inside the sidebar and could only be silently dropped. */
export type ShellWideNoNavProps = ShellWideBase &
  ConversationSlot & {
    nav: false
    items?: never
    activeId?: never
    orbitRow?: never
    onSelect?: never
    onCreate?: never
    createLabel?: never
    account?: never
    accountEmail?: never
    notifications?: never
    onPalette?: never
    paletteLabel?: never
    paletteHint?: never
    navLabel?: never
    /** The flow's ONE pinned forward action, at the bottom of the 740 column. */
    action?: React.ReactNode
    /** Rejected on a flow: a flow is not a destination, so it has no front door to pin. */
    composer?: never
  }

/** The wide shell. Discriminated on `nav`, so the wrong shape does not type-check and a screen
 *  cannot suppress shell chrome from outside. Shell412 states the identical rule. */
export type ShellWideProps = ShellWideNavProps | ShellWideNoNavProps
