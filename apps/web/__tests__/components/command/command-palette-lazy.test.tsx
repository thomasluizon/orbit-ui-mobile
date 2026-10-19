import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CommandPalette, CommandPaletteBackground } from '@/components/command/command-palette'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'

const loaded = vi.hoisted(() => {
  let releaseMenu = () => {}
  let markMenuReady = () => {}
  const pendingMenu = new Promise<void>((resolve) => { releaseMenu = resolve })
  const menuReady = new Promise<void>((resolve) => { markMenuReady = resolve })
  return { menuImports: 0, pendingMenu, releaseMenu, menuReady, markMenuReady }
})
const push = vi.hoisted(() => vi.fn())

vi.mock('@/components/command/command-menu', async (importOriginal) => {
  loaded.menuImports += 1
  const commandMenu = await importOriginal<typeof import('@/components/command/command-menu')>()
  await loaded.pendingMenu
  loaded.markMenuReady()
  return commandMenu
})
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useSearchHabits: () => {
    const habit = createMockHabit({ id: 'running', title: 'Run' })
    return {
      data: {
        topLevelHabits: [habit],
        habitsById: new Map([[habit.id, habit]]),
        childrenByParent: new Map(),
      },
      isPending: false,
      isSuccess: true,
    }
  },
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: vi.fn() }),
  useSkipHabit: () => ({ mutate: vi.fn() }),
}))

function PaletteHarness() {
  return (
    <CommandPaletteBackground>
      <button type="button" onClick={() => useShellStore.getState().setPaletteOpen(true)}>Search</button>
      <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />
    </CommandPaletteBackground>
  )
}

it('defers the real palette until its trigger, then searches, navigates and restores focus', async () => {
  const user = userEvent.setup()
  useShellStore.setState({ paletteOpen: false })
  useUIStore.setState({ openOverlayIds: [] })
  const owner = render(<PaletteHarness />)

  expect(loaded.menuImports).toBe(0)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useUIStore.getState().openOverlayIds).toEqual([])

  let trigger = screen.getByRole('button', { name: 'Search' })
  await user.click(trigger)
  await waitFor(() => expect(loaded.menuImports).toBe(1), { timeout: 5000 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
  await user.keyboard('{Escape}')
  expect(useShellStore.getState().paletteOpen).toBe(false)
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  await user.click(trigger)
  owner.unmount()
  expect(useShellStore.getState().paletteOpen).toBe(false)
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  await act(async () => {
    loaded.releaseMenu()
    await loaded.menuReady
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  render(<PaletteHarness />)
  trigger = screen.getByRole('button', { name: 'Search' })
  await user.click(trigger)
  const input = await screen.findByRole('combobox', { name: 'command.placeholder' }, { timeout: 5000 })
  expect(loaded.menuImports).toBe(1)
  await waitFor(() => expect(input).toHaveFocus())
  expect(document.querySelector('[data-command-palette-background]')).toHaveAttribute('inert')
  expect(useUIStore.getState().openOverlayIds).toHaveLength(1)

  fireEvent.click(screen.getByText('Run'))
  expect(push).toHaveBeenCalledWith('/habits/running')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  expect(document.querySelector('[data-command-palette-background]')).not.toHaveAttribute('inert')
  expect(useUIStore.getState().openOverlayIds).toEqual([])

  await user.click(trigger)
  await screen.findByRole('combobox')
  await user.click(screen.getByText('command.logHabit'))
  await user.keyboard('{Escape}')
  expect(screen.getByText('command.createHabit')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
