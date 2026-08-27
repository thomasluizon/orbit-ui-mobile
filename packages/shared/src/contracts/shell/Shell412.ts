import type { ReactNode } from 'react'

/** The conversation slot and its accessible name travel together.
 *
 * The shell ships no words, so there is no default name in either language. A conversation with no
 * name would reach a screen reader as an unlabelled dialog, and prose asking for the name is the
 * kind of rule that loses (D71), so the pair is the type. `conversationOpen` belongs here too: it
 * says whether the overlay is open, which is not a state a shell without a conversation has. */
type ConversationSlot =
  | {
      conversation?: undefined
      conversationOpen?: never
      conversationLabel?: never
    }
  | {
      /** The overlay's CONTENT. Takes authored markup as readily as a pre-built node. */
      conversation: ReactNode
      /** Omit it and presence means open. Pass it to hold markup permanently and toggle openness. */
      conversationOpen?: boolean
      /** The overlay dialog's accessible name, in the screen's locale. */
      conversationLabel: string
    }

interface Shell412Base {
  children?: ReactNode
  /** PINNED above the scroller: it does not scroll with the content. A screen with no header passes
   *  nothing and the scroller takes the full height, which is what Hoje does. */
  header?: ReactNode
  /** TRANSIENT PINNED CHROME, directly ABOVE the pinned bottom slot and never in its place. A toast
   *  or a celebration rides here so it cannot evict Astra's front door (D69). */
  notice?: ReactNode
  /** Floats above the composer. A screen that puts its create action in the header passes nothing. */
  fab?: ReactNode
  sheets?: ReactNode
}

/** A destination: the tab bar is present and the pinned bottom slot is the composer. */
export type Shell412NavProps = Shell412Base &
  ConversationSlot & {
    nav?: true
    /** Four destinations, never five. Required with navigation on. */
    tabBar: ReactNode
    /** Astra's front door, pinned above the tab bar on all four destinations. THE COMPOSER AND
     *  NOTHING ELSE: transient chrome goes in `notice`, above it. */
    composer?: ReactNode
    /** Rejected on a destination: a flow's forward action exists only where `nav` is false. */
    action?: never
  }

/** A flow: no tab bar at all, and the pinned slot carries the one forward action. */
export type Shell412NoNavProps = Shell412Base &
  ConversationSlot & {
    /** NO TAB BAR AT ALL. Absent means absent: with no composer and no fab there is no chrome
     *  element, no residual height and no hairline where the tab bar used to be. */
    nav: false
    tabBar?: never
    /** The flow's ONE pinned forward action. A node, so a step needing a quieter second action
     *  writes both here. The shell ships no words; they are the caller's. */
    action?: ReactNode
    /** Rejected on a flow: a flow is not a destination, so it has no front door to pin. */
    composer?: never
  }

/** The mobile shell at 412. Discriminated on `nav`, so whether navigation is present is the shell's
 *  own behaviour and never a screen's stylesheet reaching into the shell's markup. ShellWide states
 *  the identical rule with the identical prop. */
export type Shell412Props = Shell412NavProps | Shell412NoNavProps
