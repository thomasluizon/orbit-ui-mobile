import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { breakdownSubHabits, makeBulkCreateResponse } from '@orbit/shared/test-support/chat-fixtures'
import { BreakdownSuggestion } from '@/components/chat/breakdown-suggestion'

const bulkCreate = vi.fn()
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: bulkCreate, isPending: false }) }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm, confirmLabel }: { open: boolean; onConfirm: () => void; confirmLabel: string }) =>
    open ? <div role="dialog"><button onClick={onConfirm}>{confirmLabel}</button></div> : null,
}))

it.each([320, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))(
  'keeps actions keyboard reachable and drafts intact at $width in $locale', async ({ width, locale }) => {
    const messages = locale === 'en' ? en : pt
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: /min-width:\s*(\d+)px/.test(query) && width >= Number(query.match(/min-width:\s*(\d+)px/)![1]),
      media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }))
    bulkCreate.mockReset().mockResolvedValue(makeBulkCreateResponse(['Success', 'Success', 'Success']))
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <BreakdownSuggestion parentName="House routine" subHabits={breakdownSubHabits} onConfirmed={onConfirmed} onCancelled={vi.fn()} />
    </NextIntlClientProvider>)
    const footer = container.querySelector<HTMLElement>('[data-slot="action-row"]')!
    expect(within(footer).getAllByRole('button')).toHaveLength(3)
    expect(footer.querySelectorAll('[data-variant="primary"]')).toHaveLength(1)
    const more = screen.getByRole('button', { name: messages.habits.actions.more })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    more.focus()
    await user.keyboard('{Enter}')
    const menu = await screen.findByRole('menu', { name: messages.habits.actions.more })
    expect(menu.id).toBe(more.getAttribute('aria-controls'))
    const edit = within(menu).getByRole('menuitem', { name: messages.chat.preview.edit })
    const reject = within(menu).getByRole('menuitem', { name: messages.chat.preview.reject })
    if (width < 900) await user.tab()
    await waitFor(() => expect(edit).toHaveFocus())
    await user.keyboard('{ArrowDown}')
    expect(reject).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(more).toHaveFocus())
    await user.keyboard(' ')
    const reopenedEdit = await screen.findByRole('menuitem', { name: messages.chat.preview.edit })
    if (width < 900) {
      await waitFor(() => expect(screen.getByRole('button', { name: messages.common.close })).toHaveFocus())
      await user.tab()
    }
    expect(reopenedEdit).toHaveFocus()
    await user.keyboard('{Enter}')
    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toHaveFocus())
    await user.clear(input)
    await user.type(input, 'Kitchen dishes')
    await user.click(screen.getByRole('button', { name: messages.habits.breakdown.addHabit }))
    const added = screen.getByRole('textbox')
    await user.type(added, 'Sweep')
    await user.click(more)
    await screen.findByRole('menuitem', { name: messages.chat.preview.reject })
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Kitchen dishes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sweep' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: messages.chat.preview.approve }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: messages.chat.breakdown.confirm }))
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1))
    expect(bulkCreate.mock.calls[0]![0].habits.map((habit: { title: string }) => habit.title)).toEqual(['Kitchen dishes', 'Laundry', 'Sweep'])
  },
)
