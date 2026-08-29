import type { ReactNode } from 'react'

/** One sidebar destination. A destination with no id or no label does not compile. */
export interface ShellWideItem {
  id: string
  label: string
  icon?: string
}

/** The conversation slot and its accessible name travel together, exactly as on Shell412: one
 *  feature in two presentations, so the two platforms state the rule once. */
type ConversationSlot =
  | {
      conversation?: undefined
      conversationOpen?: never
      conversationLabel?: never
    }
  | {
      /** The panel's CONTENT. Takes authored markup as readily as a pre-built node. */
      conversation: ReactNode
      /** Omit it and presence means open. Pass it to hold markup permanently and toggle openness. */
      conversationOpen?: boolean
      /** The panel's accessible name, in the screen's locale. The shell ships no words. */
      conversationLabel: string
    }

/** The one filled create action and its word. No default exists in either language, so a create
 *  button with no word cannot be rendered. */
type CreateControl =
  | {
      onCreate?: undefined
      createLabel?: never
    }
  | {
      onCreate: () => void
      createLabel: string
    }

/** The command-palette entry and its visible word. `paletteHint` is a keycap rather than a word, so
 *  it may default, but it means nothing without the entry it annotates. */
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
  /** PINNED above the main scroller, spanning the pane beside the sidebar. Same slot and same
   *  component as Shell412's header, so a detail screen behaves identically at both widths. */
  header?: ReactNode
  /** TRANSIENT PINNED CHROME, directly ABOVE the pinned bottom slot and never in its place. */
  notice?: ReactNode
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
    activeId: string | null
    onSelect?: (id: string) => void
    /** The nav landmark's accessible name, in the screen's locale. */
    navLabel: string
    /** The account row at the foot of the sidebar. */
    account?: string
    /** Astra's front door, pinned to the bottom of the 740 main column, matching the mobile
     *  placement. THE COMPOSER AND NOTHING ELSE: transient chrome goes in `notice`, above it. */
    composer?: ReactNode
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
    onSelect?: never
    onCreate?: never
    createLabel?: never
    account?: never
    onPalette?: never
    paletteLabel?: never
    paletteHint?: never
    navLabel?: never
    /** The flow's ONE pinned forward action, at the bottom of the 740 column. */
    action?: ReactNode
    /** Rejected on a flow: a flow is not a destination, so it has no front door to pin. */
    composer?: never
  }

/** The wide shell. Discriminated on `nav`, so the wrong shape does not type-check and a screen
 *  cannot suppress shell chrome from outside. Shell412 states the identical rule. */
export type ShellWideProps = ShellWideNavProps | ShellWideNoNavProps
