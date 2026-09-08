import type { ReactNode } from 'react'
import type { ShellWideItem, ShellWideProps } from './ShellWide'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? (Exclude<keyof T, Keys<U>> extends never ? true : false) : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type ExpectedBase = {
  children?: ReactNode
  header?: ReactNode
  notice?: ReactNode
}
type ExpectedPlainConversation = {
  conversation?: undefined
  conversationOpen?: never
  conversationLabel?: never
}
type ExpectedConversation = {
  conversation: ReactNode
  conversationOpen?: boolean
  conversationLabel: string
}
type ExpectedPlainCreate = { onCreate?: undefined; createLabel?: never }
type ExpectedCreate = { onCreate: () => void; createLabel: string }
type ExpectedPlainPalette = {
  onPalette?: undefined
  paletteLabel?: never
  paletteHint?: never
}
type ExpectedPalette = {
  onPalette: () => void
  paletteLabel: string
  paletteHint?: string
}
type ExpectedNav = {
  nav?: true
  items: ShellWideItem[]
  activeId: string | null
  onSelect?: (id: string) => void
  navLabel: string
  account?: string
  composer?: ReactNode
  action?: never
}
type ExpectedFlow = {
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

type NavPlainVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation?: undefined; onCreate?: undefined; onPalette?: undefined }
>
type NavPaletteVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation?: undefined; onCreate?: undefined; onPalette: () => void }
>
type NavCreateVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation?: undefined; onCreate: () => void; onPalette?: undefined }
>
type NavCreatePaletteVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation?: undefined; onCreate: () => void; onPalette: () => void }
>
type NavConversationPlainVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation: ReactNode; onCreate?: undefined; onPalette?: undefined }
>
type NavConversationPaletteVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation: ReactNode; onCreate?: undefined; onPalette: () => void }
>
type NavConversationCreateVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation: ReactNode; onCreate: () => void; onPalette?: undefined }
>
type NavConversationCreatePaletteVariant = Extract<
  ShellWideProps,
  { nav?: true; conversation: ReactNode; onCreate: () => void; onPalette: () => void }
>
type FlowPlainVariant = Extract<ShellWideProps, { nav: false; conversation?: undefined }>
type FlowConversationVariant = Extract<ShellWideProps, { nav: false; conversation: ReactNode }>

type Destinations = ShellWideItem[]
/** The smallest sidebar that is a state: destinations, a current one, and a landmark name. */
type Sidebar = { items: Destinations; activeId: 'hoje'; navLabel: 'Navigation' }

type WithCreate = Sidebar & { onCreate: () => void; createLabel: 'Novo habito' }
type WithPalette = Sidebar & { onPalette: () => void; paletteLabel: 'Buscar'; paletteHint: 'Ctrl K' }
type WithConversation = Sidebar & { conversation: ReactNode; conversationLabel: 'Conversa' }
type Furnished = Sidebar & { onSelect: (id: string) => void; account: 'a@b.c'; composer: ReactNode }

type CreateWithoutWord = Sidebar & { onCreate: () => void }
type PaletteWithoutWord = Sidebar & { onPalette: () => void }
type HintWithoutEntry = Sidebar & { paletteHint: 'Ctrl K' }
type DestinationWithAction = Sidebar & { action: ReactNode }
type ConversationWithoutName = Sidebar & { conversation: ReactNode }
type OpenWithoutConversation = Sidebar & { conversationOpen: true }
type SidebarWithTabBar = Sidebar & { tabBar: ReactNode }
type ItemWithoutId = { items: [{ label: 'Hoje' }]; activeId: 'hoje'; navLabel: 'Navigation' }
type ItemWithoutLabel = { items: [{ id: 'hoje' }]; activeId: 'hoje'; navLabel: 'Navigation' }

export type ShellWideTypeContract = [
  Assert<IsExactWidth<Fields<NavPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedPlainCreate & ExpectedPlainPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavPaletteVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedPlainCreate & ExpectedPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavCreateVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedCreate & ExpectedPlainPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavCreatePaletteVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedCreate & ExpectedPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationPlainVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedPlainCreate & ExpectedPlainPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationPaletteVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedPlainCreate & ExpectedPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationCreateVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedCreate & ExpectedPlainPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationCreatePaletteVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedCreate & ExpectedPalette & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<FlowPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<Fields<FlowConversationVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<ShellWideItem['id'], string>>,
  Assert<IsExactWidth<ShellWideItem['label'], string>>,
  Assert<IsExactWidth<ShellWideItem['icon'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['children'], ReactNode>>,
  Assert<IsExactWidth<ShellWideProps['header'], ReactNode>>,
  Assert<IsExactWidth<ShellWideProps['notice'], ReactNode>>,
  Assert<IsExactWidth<ShellWideProps['conversation'], ReactNode>>,
  Assert<IsExactWidth<ShellWideProps['conversationOpen'], boolean | undefined>>,
  Assert<IsExactWidth<ShellWideProps['conversationLabel'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['onCreate'], (() => void) | undefined>>,
  Assert<IsExactWidth<ShellWideProps['createLabel'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['onPalette'], (() => void) | undefined>>,
  Assert<IsExactWidth<ShellWideProps['paletteLabel'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['paletteHint'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['nav'], boolean | undefined>>,
  Assert<IsExactWidth<ShellWideProps['items'], ShellWideItem[] | undefined>>,
  Assert<IsExactWidth<ShellWideProps['activeId'], string | null | undefined>>,
  Assert<IsExactWidth<ShellWideProps['onSelect'], ((id: string) => void) | undefined>>,
  Assert<IsExactWidth<ShellWideProps['navLabel'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['account'], string | undefined>>,
  Assert<IsExactWidth<ShellWideProps['composer'], ReactNode>>,
  Assert<IsExactWidth<ShellWideProps['action'], ReactNode>>,
  Assert<IsExact<Sidebar, ShellWideProps>>,
  Assert<IsExact<Furnished, ShellWideProps>>,
  Assert<IsExact<WithCreate, ShellWideProps>>,
  Assert<IsExact<WithPalette, ShellWideProps>>,
  Assert<IsExact<WithConversation, ShellWideProps>>,
  Assert<IsExact<{ nav: false; action: ReactNode }, ShellWideProps>>,
  Assert<IsExact<{ nav: false }, ShellWideProps>>,
  // @ts-expect-error a sidebar with no destinations is not a state
  Assert<IsExact<{ activeId: 'hoje'; navLabel: 'Navigation' }, ShellWideProps>>,
  // @ts-expect-error a nav with no current position is not a state
  Assert<IsExact<{ items: Destinations; navLabel: 'Navigation' }, ShellWideProps>>,
  // @ts-expect-error the nav landmark needs its accessible name
  Assert<IsExact<{ items: Destinations; activeId: 'hoje' }, ShellWideProps>>,
  // @ts-expect-error a destination without an id does not compile
  Assert<IsExact<ItemWithoutId, ShellWideProps>>,
  // @ts-expect-error a destination without a label does not compile
  Assert<IsExact<ItemWithoutLabel, ShellWideProps>>,
  // @ts-expect-error the create action needs its word
  Assert<IsExact<CreateWithoutWord, ShellWideProps>>,
  // @ts-expect-error the palette entry needs its visible word
  Assert<IsExact<PaletteWithoutWord, ShellWideProps>>,
  // @ts-expect-error a keycap annotating no entry annotates nothing
  Assert<IsExact<HintWithoutEntry, ShellWideProps>>,
  // @ts-expect-error a destination cannot carry a flow's forward action
  Assert<IsExact<DestinationWithAction, ShellWideProps>>,
  // @ts-expect-error every sidebar prop is rejected with the sidebar off
  Assert<IsExact<{ nav: false; items: Destinations }, ShellWideProps>>,
  // @ts-expect-error the account row renders inside the sidebar
  Assert<IsExact<{ nav: false; account: 'a@b.c' }, ShellWideProps>>,
  // @ts-expect-error a flow cannot pin Astra's front door
  Assert<IsExact<{ nav: false; composer: ReactNode }, ShellWideProps>>,
  // @ts-expect-error conversation content requires its accessible name
  Assert<IsExact<ConversationWithoutName, ShellWideProps>>,
  // @ts-expect-error openness is not a state a shell without a conversation has
  Assert<IsExact<OpenWithoutConversation, ShellWideProps>>,
  // @ts-expect-error the wide shell has no tab bar
  Assert<IsExact<SidebarWithTabBar, ShellWideProps>>,
]
