/** The wide shell: sidebar, a 740 column, and the conversation as a side panel.
 *  The sidebar holds the lockup, the search / command-palette entry, the same four destinations as the
 *  mobile tab bar, the one filled create action, and the account row. There is no Astra nav item.
 *  The composer pins to the BOTTOM OF THE 740 MAIN COLUMN, the same position it holds on mobile, so the
 *  two platforms do not diverge.
 *
 *  WHETHER NAVIGATION IS PRESENT IS THIS SHELL'S OWN BEHAVIOUR, NEVER A SCREEN'S STYLESHEET. `nav={false}`
 *  renders NO SIDEBAR AT ALL - not a disabled one and not an empty one, following ListRow's readOnly rule
 *  that a control which cannot be used is absent rather than greyed. A screen that suppresses shell chrome
 *  from outside, by hiding a child by class name, is reaching into the shell's internals: it breaks the
 *  moment the shell's markup changes, and it leaves the two platforms disagreeing about the same
 *  behaviour. This is the prop that flow does exist for, and Shell412 states it the same way.
 *
 *  Discriminated on `nav`, so the wrong shape does not type-check: with the sidebar OFF, `items`,
 *  `activeId`, `onSelect`, `account`, `onPalette`, `paletteHint`, `onCreate` and `createLabel` are all rejected,
 *  because every one of them renders inside the sidebar and none of them can do anything without it. With
 *  the sidebar ON, `items` and `activeId` stay REQUIRED - a sidebar with no destinations is not a state. */
interface ShellWideBase {
  children?: any;
  /** PINNED above the main scroller, spanning the pane beside the sidebar: it does not scroll with the
   *  content. Same slot and same component (NavHeader) as Shell412's header, so a detail screen behaves
   *  identically at both widths.
   *  A screen with no header passes NOTHING and the scroller takes the full height, which is what Hoje does. */
  header?: any;
  /** TRANSIENT PINNED CHROME - a Toast, a celebration line - directly ABOVE the pinned bottom slot
   *  (the composer on a destination, the action on a flow), never in its place. This slot exists because
   *  transient panels were riding the composer slot and deleting Astra's front door while on screen, on
   *  screens where D69 says the composer is present on every destination. A toast belongs above a pinned
   *  action just as it belongs above a composer; that is this slot's whole reason to exist. */
  notice?: any;
  /** the conversation panel's CONTENT. Takes authored MARKUP as readily as a pre-built node, the way every
   *  other slot in this shell does: a screen whose subject IS the conversation writes the panel inline here
   *  and controls openness with `conversationOpen`, instead of having to hand over a finished node.
   *  The shell owns the panel's frame and nothing inside it. */
  conversation?: any;
  /** whether the panel is open. Omit it and PRESENCE means open, which is right for a screen that merely has
   *  the panel open (`conversation={open ? <Conversation /> : null}`). Pass it and the slot can hold authored
   *  markup permanently while this flag opens and closes it - the case a conversation-subject screen needs.
   *  Same feature as the mobile overlay, in its wide presentation. */
  conversationOpen?: boolean;
  /** REQUIRED with `conversation`: the panel's accessible name, in the screen's locale (e.g. "Conversa com
   *  o Astra" / "Conversation with Astra"). The shell ships no words - no default exists in either language. */
  conversationLabel?: string;
}
export interface ShellWideNavProps extends ShellWideBase {
  /** the sidebar is present. Default. */
  nav?: true;
  /** four destinations, never five. REQUIRED with the sidebar on. */
  items: Array<{ id: string; label: string; icon?: string }>;
  /** REQUIRED with the sidebar on: a nav with no current position is not a state. */
  activeId: string;
  onSelect?: (id: string) => void;
  /** REQUIRED with the sidebar on: the nav landmark's accessible name, in the screen's locale. The shell
   *  ships no words of its own - no default exists in either language. */
  navLabel: string;
  /** the one filled create action, in the sidebar footer */
  onCreate?: () => void;
  /** REQUIRED with `onCreate`: the create button's word, in the screen's locale. No default exists. */
  createLabel?: string;
  /** the account row at the foot of the sidebar */
  account?: string;
  /** the search / command-palette entry at the head of the sidebar */
  onPalette?: () => void;
  /** REQUIRED with `onPalette`: the entry's visible word (e.g. "Buscar" / "Search"). No default exists. */
  paletteLabel?: string;
  /** the keycap hint, e.g. "Ctrl K" - a keycap, not a word, so it may default */
  paletteHint?: string;
  /** Astra's front door. Pins to the bottom of the 740 main column, matching the mobile placement. THE
   *  COMPOSER AND NOTHING ELSE: a toast or a celebration goes in `notice`, above it, so it never evicts
   *  the front door. */
  composer?: any;
  /** rejected on a destination: the pinned bottom slot is the composer (D69). A flow's forward action
   *  exists only where `nav` is false. */
  action?: never;
}
export interface ShellWideNoNavProps extends ShellWideBase {
  /** NO SIDEBAR AT ALL: the main column takes the full width. For a flow that owns the whole screen while
   *  the person decides something - onboarding's three decisions - and gives navigation back at the step
   *  where it belongs. Both shells take this prop, so the two platforms state one behaviour once. */
  nav: false;
  /** every sidebar prop is rejected with the sidebar off: it renders inside the sidebar, so with no sidebar
   *  it could only be silently dropped. */
  items?: never;
  activeId?: never;
  onSelect?: never;
  onCreate?: never;
  createLabel?: never;
  account?: never;
  onPalette?: never;
  paletteLabel?: never;
  paletteHint?: never;
  navLabel?: never;
  /** the flow's ONE pinned forward action. A node, so a step that needs a second, quieter action under
   *  the first (allow, then not now) writes both here. It sits where the composer sits - the bottom of
   *  the 740 column - with the same pinned behaviour and the same safe area inset, so nothing shifts as
   *  a flow moves between steps. NO DEFAULT: a flow with no pinned action passes nothing and the
   *  scroller takes the full height, the way a screen with no header already does. The words in it are
   *  the caller's; the shell ships no words. */
  action?: any;
  /** rejected on a flow: a flow that owns the screen has no front door to pin, and passing one would
   *  put Astra under a person who has not finished deciding. D69's composer-on-every-destination rule
   *  does not reach here, because a flow is not a destination - that is what nav: false means. */
  composer?: never;
}
/** Discriminated on `nav`: the sidebar's props exist only where the sidebar does, and the pinned bottom
 *  slot is typed for the two shapes it really has - the composer on a destination, the flow's one
 *  forward action on a flow. Shell412 states the identical rule. */
export type ShellWideProps = ShellWideNavProps | ShellWideNoNavProps;
export declare function ShellWide(props: ShellWideProps): any;
