/** The mobile shell at 412. An optional pinned header, one scroller, and a pinned chrome block at the
 *  bottom carrying the composer above the tab bar. Safe-area aware.
 *  The tab bar holds EXACTLY four destinations: Hoje, Calendario, Progresso, Perfil. There is no Astra tab.
 *  The conversation is a full-height overlay inside this shell, opened from the composer, never a route.
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
  /** PINNED above the scroller: it does not scroll with the content. Pass NavHeader here - a detail
   *  screen keeps its title and its back control at every scroll position.
   *  A screen with no header passes NOTHING and the scroller takes the full height, which is what Hoje does. */
  header?: any;
  /** TRANSIENT PINNED CHROME - a Toast, a celebration line - directly ABOVE the pinned bottom slot
   *  (the composer on a destination, the action on a flow), never in its place. This slot exists because
   *  transient panels were riding the composer slot and deleting Astra's front door while on screen, on
   *  screens where D69 says the composer is present on every destination. A toast belongs above a pinned
   *  action just as it belongs above a composer; that is this slot's whole reason to exist. */
  notice?: any;
  /** optional, floats above the composer. A screen that puts its create action in the header passes nothing. */
  fab?: any;
  /** the full-height conversation overlay's CONTENT. Takes authored MARKUP as readily as a pre-built node,
   *  the way every other slot in this shell does. Openness is `conversationOpen`. */
  conversation?: any;
  /** whether the overlay is open. Omit it and PRESENCE means open, which is right for a screen that merely
   *  has the panel open. Pass it and the slot can hold authored markup permanently while this flag opens and
   *  closes it - the case a conversation-subject screen needs. */
  conversationOpen?: boolean;
  /** REQUIRED with `conversation`: the overlay dialog's accessible name, in the screen's locale. The shell
   *  ships no words - no default exists in either language. */
  conversationLabel?: string;
  sheets?: any;
}
export interface Shell412NavProps extends Shell412Base {
  /** the tab bar is present. Default. */
  nav?: true;
  /** four destinations, never five. REQUIRED with navigation on. */
  tabBar: any;
  /** Astra's front door, pinned above the tab bar on all four destinations. THE COMPOSER AND NOTHING
   *  ELSE: a toast or a celebration goes in `notice`, above it, so it never evicts the front door. */
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
  /** rejected on a flow: a flow that owns the screen has no front door to pin, and passing one would
   *  put Astra under a person who has not finished deciding. D69's composer-on-every-destination rule
   *  does not reach here, because a flow is not a destination - that is what nav: false means. */
  composer?: never;
}
/** Discriminated on `nav`: the tab bar slot exists only where navigation does, and the pinned bottom
 *  slot is typed for the two shapes it really has - the composer on a destination, the flow's one
 *  forward action on a flow. ShellWide states the identical rule. */
export type Shell412Props = Shell412NavProps | Shell412NoNavProps;
export declare function Shell412(props: Shell412Props): any;
