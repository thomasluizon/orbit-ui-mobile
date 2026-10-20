import { useState } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useSearchHabits: () => {
    const habit = createMockHabit({ id: 'running', title: 'Run' })
    return {
      data: { topLevelHabits: [habit], habitsById: new Map([[habit.id, habit]]), childrenByParent: new Map() },
      isPending: false,
      isSuccess: true,
    }
  },
}))
vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: vi.fn() }),
  useSkipHabit: () => ({ mutate: vi.fn() }),
}))

beforeEach(() => vi.resetModules())
afterEach(cleanup)

async function openSheetOverPendingPalette() {
  let releaseMenu = () => {}
  let markMenuReady = () => {}
  const pendingMenu = new Promise<void>((resolve) => { releaseMenu = resolve })
  const menuReady = new Promise<void>((resolve) => { markMenuReady = resolve })
  const menuImportStarted = vi.fn()
  vi.doMock('@/components/command/command-menu', async (importOriginal) => {
    menuImportStarted()
    const commandMenu = await importOriginal<typeof import('@/components/command/command-menu')>()
    await pendingMenu
    markMenuReady()
    return commandMenu
  })
  const { CommandPalette, CommandPaletteBackground } = await import('@/components/command/command-palette')
  const { Sheet } = await import('@/components/ui/sheet')
  const { useShellStore } = await import('@/stores/shell-store')
  const { useUIStore } = await import('@/stores/ui-store')
  const { useAppToastStore } = await import('@/stores/app-toast-store')
  const user = userEvent.setup()
  function Harness() {
    const [sheetOpen, setSheetOpen] = useState(false)
    return <CommandPaletteBackground>
      <button type="button" onClick={() => useShellStore.getState().setPaletteOpen(true)}>Search</button>
      <button type="button" onClick={() => setSheetOpen(true)}>Open sheet</button>
      <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />
      {sheetOpen && <Sheet title="Options" onClose={() => setSheetOpen(false)}>
        <input aria-label="Sheet field" />
      </Sheet>}
    </CommandPaletteBackground>
  }
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(menuImportStarted).toHaveBeenCalledOnce())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Open sheet' }))
  const sheet = await screen.findByRole('dialog', { name: 'Options' })
  await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement))
  await user.click(within(sheet).getByRole('textbox', { name: 'Sheet field' }))
  act(() => { useAppToastStore.getState().showQueued('Still here', 'Undo', vi.fn()) })
  await waitFor(() => expect(sheet.querySelector('[data-kind="neutral"][role="status"]')).toHaveTextContent('Still here'))
  return {
    user, sheet, useShellStore, useUIStore,
    release: () => act(async () => { releaseMenu(); await menuReady }),
  }
}

it('keeps focus and notices in the newer Sheet when the real pending menu import resolves', async () => {
  const { sheet, release, useShellStore, useUIStore } = await openSheetOverPendingPalette()
  await release()
  await waitFor(() => expect(within(sheet).getByRole('textbox')).toHaveFocus())
  expect(sheet.querySelector('[data-kind="neutral"][role="status"]')).toHaveTextContent('Still here')
  expect(useShellStore.getState().paletteOpen).toBe(false)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(useUIStore.getState().openOverlayIds).toHaveLength(1)
})

it('dismisses the newer Sheet with Escape while the superseded palette stays closed', async () => {
  const { user, release, useShellStore, useUIStore } = await openSheetOverPendingPalette()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Options' })).not.toBeInTheDocument())
  expect(useShellStore.getState().paletteOpen).toBe(false)
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  await release()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Search' }))
  const input = await screen.findByRole('combobox', { name: 'command.placeholder' })
  await waitFor(() => expect(input).toHaveFocus())
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
