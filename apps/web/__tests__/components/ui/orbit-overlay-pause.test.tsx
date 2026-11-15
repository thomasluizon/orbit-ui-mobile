import { act, render } from '@testing-library/react'
import { createRef } from 'react'
import { setOrbitMotionEnabled } from '@orbit/shared/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPaletteDialog } from '@/components/command/command-palette-dialog'
import { ShellWide } from '@/components/shell/shell-wide'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { Sheet } from '@/components/ui/sheet'
import { useShellStore } from '@/stores/shell-store'

vi.mock('next/navigation', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/navigation')>(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/components/command/command-menu', () => ({ CommandMenu: () => <p>Commands</p> }))

/** The loop of each Orbit by its state, so a test reads the page Orbit and the overlay Orbit apart. */
function loops(container: ParentNode) {
  return Object.fromEntries([...container.querySelectorAll('[data-asset="orbit-mascot"]')]
    .map((mascot) => [mascot.getAttribute('data-orbit-state'), mascot.getAttribute('data-orbit-loop')]))
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  useShellStore.setState({ paletteOpen: false })
})
afterEach(() => {
  setOrbitMotionEnabled(undefined)
  useShellStore.setState({ paletteOpen: false })
  vi.unstubAllGlobals()
})

describe('an overlay over a live Orbit on web', () => {
  it('pauses the page Orbit under a real Sheet, runs the Orbit inside it, and resumes on close', () => {
    const page = (open: boolean) => <><OrbitMascot size={96} />{open ? <Sheet title="Options"><OrbitMascot size={96} state="feliz" /></Sheet> : null}</>
    const { rerender } = render(page(true))
    expect(loops(document)).toEqual({ parado: 'still', feliz: 'running' })
    rerender(page(false))
    expect(loops(document)).toEqual({ parado: 'running' })
  })

  it('pauses the page Orbit while the command palette is open', () => {
    render(<><OrbitMascot size={96} /><CommandPaletteDialog navItems={[]} onCreateHabit={vi.fn()} modalId="modal:palette" panelRef={createRef()} /></>)
    expect(loops(document)).toEqual({ parado: 'running' })
    act(() => { useShellStore.setState({ paletteOpen: true }) })
    expect(loops(document)).toEqual({ parado: 'still' })
    act(() => { useShellStore.setState({ paletteOpen: false }) })
    expect(loops(document)).toEqual({ parado: 'running' })
  })

  it('pauses the destination Orbit behind the open conversation and runs the Orbit inside the conversation', () => {
    const shell = (open: boolean) => (
      <ShellWide astraRow={{ label: 'Talk to Orbit', onOpen: () => {} }}
        items={[{ id: 'hoje', href: '/', label: 'Today', icon: 'hoje' }]}
        activeId="hoje"
        navLabel="Main navigation"
        tabBar={<div>Tabs</div>}
        conversation={<OrbitMascot size={48} state="descansando" />}
        conversationOpen={open}
        conversationLabel="Conversation"
      >
        <OrbitMascot size={96} state="feliz" />
      </ShellWide>
    )
    const { rerender } = render(shell(true))
    expect(loops(document)).toEqual({ feliz: 'still', descansando: 'running' })
    rerender(shell(false))
    expect(loops(document)).toEqual({ feliz: 'running' })
  })
})
