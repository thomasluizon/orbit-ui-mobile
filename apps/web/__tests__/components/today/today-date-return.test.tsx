import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { TodayDateControl } from '@/app/(app)/today-shell'

vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

const noop = () => {}
const props = {
  dayName: 'Wednesday', numericDate: '8 Apr', isTodaySelected: false, nextDisabled: false,
  previousLabel: 'Previous', nextLabel: 'Next', goToTodayLabel: en.dates.goToToday, moreLabel: 'Options', searchLabel: 'Search', selectLabel: 'Select',
  collapseLabel: 'Collapse', allCollapsed: false, refreshLabel: 'Refresh', completedLabel: 'Completed',
  showCompleted: false, isFetching: false, onGoToPreviousDay: noop, onGoToNextDay: noop,
  onGoToToday: noop, onSearch: noop, onToggleSelect: noop, onToggleCollapse: noop,
  onRefresh: noop, onToggleCompleted: noop,
}

describe('Today date return', () => {
  it.each([['en', en], ['pt-BR', ptBr]] as const)('returns through the date label by click, Enter and Space in %s', async (locale, messages) => {
    const onGoToToday = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
      <TodayDateControl {...props} goToTodayLabel={messages.dates.goToToday} onGoToToday={onGoToToday} />
    </NextIntlClientProvider>)
    const row = container.querySelector<HTMLElement>('[data-today-date-row]')!
    const label = within(row).getByRole('button', { name: new RegExp(messages.dates.goToToday) })
    expect(label).toHaveAccessibleName(`Wednesday, 8 Apr, ${messages.dates.goToToday}`)
    expect(container.querySelector('[data-today-header-actions]')).not.toContainElement(label)
    expect(screen.queryByRole('button', { name: messages.dates.goToToday })).not.toBeInTheDocument()
    await user.click(label)
    label.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onGoToToday).toHaveBeenCalledTimes(3)
  })

  it('keeps the current date inert', async () => {
    const onGoToToday = vi.fn()
    const user = userEvent.setup()
    render(<NextIntlClientProvider locale="en" messages={en}>
      <TodayDateControl {...props} isTodaySelected onGoToToday={onGoToToday} />
    </NextIntlClientProvider>)
    const label = screen.getByRole('button', { name: 'Wednesday, 8 Apr' })
    expect(label).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(label)
    label.focus()
    await user.keyboard('{Enter} ')
    expect(onGoToToday).not.toHaveBeenCalled()
  })
})
