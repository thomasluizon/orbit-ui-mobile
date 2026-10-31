import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { motionDurations } from '@orbit/shared/theme'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const cases = (['sheet', 'anchored'] as const).flatMap((presentation) =>
  (['open', 'dismissed', 'reopened'] as const).flatMap((phase) =>
    (['pointer', 'keyboard'] as const).map((activation) => ({ presentation, phase, activation }))))

describe('HabitRow menu replacement', () => {
  it.each([false, true])('offers Skip only for a scheduled row, isGeneral=%s', async (isGeneral) => {
    const onSkip = vi.fn()
    render(<HabitRow habit={createMockHabit({ isGeneral, frequencyUnit: isGeneral ? null : 'Day' })}
      actions={{ onSkip, onEdit: vi.fn() }} />)
    await userEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    await screen.findByRole('menuitem', { name: 'common.edit' })
    const skip = screen.queryByRole('menuitem', { name: 'habits.actions.skip' })
    if (isGeneral) expect(skip).toBeNull()
    else {
      expect(skip).toBeVisible()
      await userEvent.click(skip!)
      await waitFor(() => expect(onSkip).toHaveBeenCalledOnce())
    }
  })

  it.each([false, true])('keeps the compact row menu visible after entrance with reduced motion %s', async (reduced) => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion') && reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onEdit, onDelete }} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    const menu = await screen.findByRole('menu', { name: 'Read' })
    await new Promise(resolve => setTimeout(resolve, motionDurations.slow))
    expect(menu).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'common.edit' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'habits.actions.delete' })).toBeVisible()
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(screen.getByRole('menuitem', { name: 'common.edit' }))
    await waitFor(() => expect(onEdit).toHaveBeenCalledOnce())
    expect(screen.queryByRole('menu', { name: 'Read' })).toBeNull()
  })

  it('discloses a full habit name from the real row menu without an edit action', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(60)
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
    onTestFinished(() => { scrollHeight.mockRestore(); clientHeight.mockRestore() })
    const title = 'Ler um capítulo inteiro do livro de história antes de dormir e anotar as ideias para conversar com meus amigos amanhã cedo.'
    const onDelete = vi.fn()
    render(<HabitRow habit={createMockHabit({ title })} actions={{ onDelete }} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'habits.actions.more' }), { button: 0, ctrlKey: false })
    const menu = await screen.findByRole('menu', { name: title })
    const header = menu.closest('[role="dialog"]')!.querySelector('header')!
    fireEvent.click(header.querySelector('button[aria-expanded]')!)
    expect(screen.getByRole('dialog', { name: title }).querySelector('[data-slot="sheet-body"]')).toHaveTextContent(title)
    expect(screen.getByRole('menu', { name: title })).toBeVisible()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('renders a fitting habit name in the menu sheet without an expand control', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(40)
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40)
    onTestFinished(() => { scrollHeight.mockRestore(); clientHeight.mockRestore() })
    render(<HabitRow habit={createMockHabit({ title: 'Read' })} actions={{ onDelete: vi.fn() }} />)
    await userEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    const menu = await screen.findByRole('menu', { name: 'Read' })
    const header = menu.closest('[role="dialog"]')!.querySelector('header')!
    expect(header).toHaveTextContent('Read')
    expect(header.querySelector('button[aria-expanded]')).toBeNull()
  })

  it.each(cases)('replaces the $phase $presentation menu via $activation', async ({ presentation, phase, activation }) => {
    vi.stubGlobal('matchMedia', () => ({ matches: presentation === 'anchored', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    render(<>
      <HabitRow habit={createMockHabit({ id: 'a', title: 'Read' })} actions={{ onEdit: vi.fn() }} />
      <HabitRow habit={createMockHabit({ id: 'b', title: 'Run' })} actions={{ onDelete: vi.fn() }} />
    </>)
    const [first, second] = screen.getAllByRole('button', { name: 'habits.actions.more' })
    const user = userEvent.setup()
    const press = async (trigger: HTMLElement) => {
      if (activation === 'pointer') await user.click(trigger)
      else fireEvent.keyDown(trigger, { key: 'Enter' })
    }
    await press(first!)
    await screen.findByRole('menuitem', { name: 'common.edit' })
    if (phase !== 'open') {
      fireEvent.keyDown(document, { key: 'Escape' })
      if (phase === 'reopened') {
        await press(first!)
        await screen.findByRole('menuitem', { name: 'common.edit' })
      }
    }
    await press(second!)
    await screen.findByRole('menuitem', { name: 'habits.actions.delete' })
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.queryByRole('menuitem', { name: 'common.edit' })).toBeNull()
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(first).toHaveAttribute('aria-expanded', 'false')
    if (presentation === 'anchored') {
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'habits.actions.delete' })).toHaveFocus())
    }
  })
})
