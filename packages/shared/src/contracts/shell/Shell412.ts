
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

interface Shell412Base {
  children?: React.ReactNode
  header?: React.ReactNode
  notice?: React.ReactNode
  fab?: React.ReactNode
  scrollToTop?: React.ReactNode
  sheets?: React.ReactNode
}

/** A destination: the tab bar is present and the pinned bottom slot is the composer. */
export type Shell412NavProps = Shell412Base &
  ConversationSlot & {
    nav?: true
    /** Four destinations, never five. Required with navigation on. */
    tabBar: React.ReactNode
    /** Habit detail's composer or Hoje's selection tray, pinned above the tab bar.
     *  Transient chrome goes in `notice`, above it. */
    composer?: React.ReactNode
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
    action?: React.ReactNode
    /** Rejected on a flow: a flow is not a destination, so it has no front door to pin. */
    composer?: never
  }

/** The mobile shell at 412. Discriminated on `nav`, so whether navigation is present is the shell's
 *  own behaviour and never a screen's stylesheet reaching into the shell's markup. ShellWide states
 *  the identical rule with the identical prop. */
export type Shell412Props = Shell412NavProps | Shell412NoNavProps
