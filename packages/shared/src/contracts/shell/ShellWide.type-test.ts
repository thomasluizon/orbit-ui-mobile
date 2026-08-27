import type { ReactNode } from 'react'
import type { ShellWideItem, ShellWideProps } from './ShellWide'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? (Exclude<keyof T, Keys<U>> extends never ? true : false) : false
type Assert<T extends true> = T

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
