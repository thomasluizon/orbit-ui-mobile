/** The mobile shell at 412. An optional pinned header, one scroller, and a pinned chrome block at the
 *  bottom carrying habit detail's composer or Hoje's selection tray above the tab bar. Safe-area aware.
 *  The tab bar holds EXACTLY four destinations: Hoje, Calendario, Progresso, Perfil. There is no Astra tab.
 *  The conversation covers this shell and its tab bar. Hoje's floating Astra entry opens it, never a route.
 *
 *  WHETHER NAVIGATION IS PRESENT IS THIS SHELL'S OWN BEHAVIOUR, NEVER A SCREEN'S STYLESHEET. `nav={false}`
 *  renders NO TAB BAR AT ALL, and the type then rejects `tabBar` outright rather than accepting a null a
 *  caller had to remember to pass. ShellWide states the identical rule with the identical prop, so a flow
 *  that hides navigation while the person decides something declares that ONCE and both platforms agree.
 *  A screen that suppresses shell chrome from outside - hiding a child by class name - is reaching into the
 *  shell's internals, breaks when the shell's markup changes, and lets the two platforms drift apart.
 *
 *  ABSENT MEANS ABSENT, not an empty band. The bottom chrome block renders only when something occupies it,
 *  so a step with `nav={false}` and no composer and no fab has NO chrome element at all - no residual height
 *  and no hairline rule where the tab bar used to be - and the scroller takes the shell's full height. The
 *  same rule as the sidebar: an empty container is still a container, and the person can see it. */
interface Shell412Base {
  children?: any;
  /** Pinned above the scroller. Hoje and Calendário pass a minimum-height 48 row with a trailing
   * Avisos bell; Hoje also has its conditional day jump, search and options, Calendário its options.
   * Progresso and Perfil put their bell-only minimum-height 48 row in children so it scrolls, with
   * no screen title. A detail header keeps its title and back control visible. */
  header?: any;
  /** Transient pinned chrome above habit detail's composer, Hoje's selection tray or a flow's action.
   *  With no bottom content it sits above the tab bar, outside Hoje's floating Astra area. */
  notice?: any;
  /** optional, floats above the composer. A screen that puts its create action in the header passes nothing. */
  fab?: any;
  /** Hoje only: top-centre back-to-top below the pinned header, separate from the create FAB. */
  scrollToTop?: any;
  /** the full-screen conversation's CONTENT, including its own header, thread, chips and composer. Takes authored MARKUP as readily as a pre-built node,
   *  the way every other slot in this shell does. Openness is `conversationOpen`. */
  conversation?: any;
  /** whether the conversation is open. Omit it and PRESENCE means open, which is right for a screen that merely
   *  has the conversation open. Pass it and the slot can hold authored markup permanently while this flag opens and
   *  closes it - the case a conversation-subject screen needs. */
  conversationOpen?: boolean;
  /** REQUIRED with `conversation`: the full-screen layer's accessible name, Astra in both locales. The shell
   *  ships no words - no default exists in either language. */
  conversationLabel?: string;
  sheets?: any;
}
export interface Shell412NavProps extends Shell412Base {
  /** the tab bar is present. Default. */
  nav?: true;
  /** four destinations, never five. REQUIRED with navigation on. */
  tabBar: any;
  /** Habit detail's composer or Hoje's active selection tray, pinned above the tab bar.
   *  Resting Hoje uses the floating Astra entry specified by the canvas amendment. */
  composer?: any;
  /** rejected on a destination: the pinned bottom slot is the composer (D69). A flow's forward action
   *  exists only where `nav` is false. */
  action?: never;
}
export interface Shell412NoNavProps extends Shell412Base {
  /** NO TAB BAR AT ALL: the scroller and the pinned slot take the height the tab bar held. For a flow
   *  that owns the whole screen while the person decides something. ShellWide takes the same prop. */
  nav: false;
  /** rejected with navigation off: with no tab bar it could only be silently dropped. */
  tabBar?: never;
  /** the flow's ONE pinned forward action. A node, so a step that needs a second, quieter action under
   *  the first (allow, then not now) writes both here. It sits where the composer sits, with the same
   *  pinned behaviour and the same safe area inset, so nothing shifts as a flow moves between steps.
   *  NO DEFAULT: a flow with no pinned action passes nothing and the scroller takes the full height,
   *  the way a screen with no header already does. The words in it are the caller's; the shell ships
   *  no words. */
  action?: any;
  /** Rejected on a flow: its forward action owns the pinned slot. Astra's floating Hoje entry
   *  belongs to a destination, so it is absent while a flow owns the screen. */
  composer?: never;
}
/** Discriminated on `nav`: the tab bar slot exists only where navigation does, and the pinned bottom
 *  slot is typed for the two shapes it really has - the composer on a destination, the flow's one
 *  forward action on a flow. ShellWide states the identical rule. */
export type Shell412Props = Shell412NavProps | Shell412NoNavProps;
export declare function Shell412(props: Shell412Props): any;
