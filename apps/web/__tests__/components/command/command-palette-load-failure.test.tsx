import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CommandPalette, CommandPaletteBackground } from '@/components/command/command-palette'
import { AppToastHost } from '@/components/ui/app-toast-host'
import { useShellStore } from '@/stores/shell-store'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'

const chunk = vi.hoisted(() => ({ reject: (_error: Error) => {}, started: vi.fn() }))
vi.mock('next/dynamic', async () => {
  const appDynamic = await import('next/dist/shared/lib/app-dynamic')
  return { default: appDynamic }
})
vi.mock('@/components/command/command-palette-dialog', async (importOriginal) => {
  chunk.started()
  await new Promise<void>((_resolve, reject) => { chunk.reject = reject })
  return importOriginal<typeof import('@/components/command/command-palette-dialog')>()
})
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-habit-queries', () => ({
  useSearchHabits: () => {
    const habit = createMockHabit({ id: 'running', title: 'Run' })
    return { data: { topLevelHabits: [habit], habitsById: new Map([[habit.id, habit]]), childrenByParent: new Map() }, isPending: false, isSuccess: true }
  },
}))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: vi.fn() }), useSkipHabit: () => ({ mutate: vi.fn() }) }))

it('contains a rejected App Router chunk, announces the failure and imports again on the next open', async () => {
  useShellStore.setState({ paletteOpen: false })
  useUIStore.setState({ openOverlayIds: [] })
  useAppToastStore.getState().dismissAllToasts()
  render(
    <CommandPaletteBackground>
      <main>Today screen</main>
      <button type="button" onClick={() => useShellStore.getState().setPaletteOpen(true)}>Search</button>
      <AppToastHost />
      <CommandPalette navItems={[]} onCreateHabit={vi.fn()} />
    </CommandPaletteBackground>,
  )
  expect(chunk.started).not.toHaveBeenCalled()
  const trigger = screen.getByRole('button', { name: 'Search' })
  trigger.focus()
  fireEvent.click(trigger)
  await waitFor(() => expect(chunk.started).toHaveBeenCalledTimes(1))
  await act(async () => { chunk.reject(new Error('Chunk unavailable')) })
  await waitFor(() => expect(useShellStore.getState().paletteOpen).toBe(false))
  expect(screen.getByRole('main')).toHaveTextContent('Today screen')
  expect(await screen.findByText('command.loadFailed')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(useUIStore.getState().openOverlayIds).toEqual([])
  expect(document.querySelector('[data-command-palette-background]')).not.toHaveAttribute('inert')
  expect(trigger).toHaveFocus()

  vi.doUnmock('@/components/command/command-palette-dialog')
  fireEvent.click(trigger)
  const input = await screen.findByRole('combobox', { name: 'command.placeholder' }, { timeout: 5000 })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await waitFor(() => expect(input).toHaveFocus())
  expect(screen.getByText('Run')).toBeInTheDocument()
  expect(screen.queryByText('command.loadFailed')).not.toBeInTheDocument()
  expect(useAppToastStore.getState().currentToast).toBeNull()
})
