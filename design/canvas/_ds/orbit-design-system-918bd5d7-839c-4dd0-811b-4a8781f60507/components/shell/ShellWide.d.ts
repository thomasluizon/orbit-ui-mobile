/** The wide shell: sidebar and a centred column capped at 740. The full-screen conversation replaces
 *  the destination column from its top inset to the viewport bottom, keeping the sidebar visible.
 *  The sidebar holds the lockup, search, the Astra row above the same four destinations as the compact
 *  tab bar, the notifications entry, the one filled create action and the account row.
 *  The Astra row is the wide front door. Only habit detail uses the destination composer slot.
 *
 *  WHETHER NAVIGATION IS PRESENT IS THIS SHELL'S OWN BEHAVIOUR, NEVER A SCREEN'S STYLESHEET. `nav={false}`
 *  renders NO SIDEBAR AT ALL - not a disabled one and not an empty one, following ListRow's readOnly rule
 *  that a control which cannot be used is absent rather than greyed. A screen that suppresses shell chrome
 *  from outside, by hiding a child by class name, is reaching into the shell's internals: it breaks the
 *  moment the shell's markup changes, and it leaves the two platforms disagreeing about the same
 *  behaviour. This is the prop that flow does exist for, and Shell412 states it the same way.
 *
 *  Discriminated on `nav`, so the wrong shape does not type-check: with the sidebar OFF, `astraRow`, `items`,
 *  `activeId`, `onSelect`, `account`, `onPalette`, `paletteHint`, `onCreate` and `createLabel` are all rejected,
 *  because every one of them renders inside the sidebar and none of them can do anything without it. With
 *  the sidebar ON, `astraRow`, `items` and `activeId` stay REQUIRED - a sidebar with no destinations is not a state. */
interface ShellWideBase {
  children?: any;
  /** PINNED above the main scroller, spanning the pane beside the sidebar: it does not scroll with the
   *  content. Same slot and same component (NavHeader) as Shell412's header, so a detail screen behaves
   *  identically at both widths.
   *  A screen with no header passes NOTHING and the scroller takes the full height, which is what Hoje does. */
  header?: any;
  /** Transient pinned chrome above habit detail's composer or a flow's action. On other wide
   *  destinations it sits above the column bottom. It never replaces the pinned slot. */
  notice?: any;
  /** The full-screen conversation's content: its own NavHeader, thread, chips and composer.
   *  Replaces the destination's header, scroller and bottom chrome in the centred 740 column.
   *  The sidebar stays visible. The conversation uses the same layout as the compact full screen. */
  conversation?: any;
  /** Whether the conversation is open. Omitted means presence opens it. When open, only `astraRow`
   *  draws the current-position treatment; `activeId` keeps aria-current="page" on the routed
   *  destination without its visual selection. No route changes. */
  conversationOpen?: boolean;
  /** Required with `conversation`: the layer's accessible name, `Astra` in both locales. */
  conversationLabel?: string;
}
export interface ShellWideNavProps extends ShellWideBase {
  /** the sidebar is present. Default. */
  nav?: true;
  /** Required with the sidebar on: a button opening the conversation, never a link or destination.
   *  First in the destination list, directly above Hoje with a 4 list gap. Minimum height 48,
   *  radius 12, inline padding 12, gap 12, 20 Astra glyph, 14/500 Astra label with translate="no".
   *  Open conversation: --primary glyph and --primary-soft label, the only visually current row.
   *  The caller supplies the button node; the shell owns its placement and destination treatment. */
  astraRow: any;
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
  /** Habit detail's own composer only, with its habit chips, pinned to the bottom of the 740 column.
   *  Wide Hoje has no shell composer: the sidebar Astra row opens the conversation.
   *  A toast or celebration uses `notice`. The conversation owns its composer inside its content. */
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
  astraRow?: never;
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
   *  put Astra under a person who has not finished deciding. The compact shell's composer-on-Hoje rule
   *  does not reach here, because a flow is not a destination - that is what nav: false means. */
  composer?: never;
}
/** Discriminated on `nav`: the sidebar's props exist only where the sidebar does, and the pinned bottom
 *  slot is typed for the two shapes it really has - the composer on a destination, the flow's one
 *  forward action on a flow. Shell412 uses the compact Hoje composer and the same flow action rule. */
export type ShellWideProps = ShellWideNavProps | ShellWideNoNavProps;
export declare function ShellWide(props: ShellWideProps): any;
