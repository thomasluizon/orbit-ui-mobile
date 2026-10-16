import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { useUIStore } from '@/stores/ui-store'

vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

const noop = () => {}

beforeEach(() => { useUIStore.setState({ activeFilters: {} }) })

it.each([['en', en], ['pt-BR', ptBr]] as const)('opens the %s frequency sheet after closing list options', async (locale, words) => {
  const rendered = render(<NextIntlClientProvider locale={locale} messages={words}>
    <TodayDateControl dayName={words.dates.today} numericDate="04/09" isTodaySelected nextDisabled={false}
      previousLabel={words.dates.previousDay} todayLabel={words.dates.today} goToTodayLabel={words.dates.goToToday}
      nextLabel={words.dates.nextDay} moreLabel={words.habits.listOptions} menuHeading={words.common.options}
      selectLabel={words.common.select} collapseLabel={words.habits.collapseAll} allCollapsed={false}
      refreshLabel={words.habits.refresh} completedLabel={words.habits.showCompleted} showCompleted={false}
      isFetching={false} searchLabel={words.habits.search.title} onSearch={noop}
      onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
      onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />
  </NextIntlClientProvider>)
  const openFrequencies = async () => {
    fireEvent.click(screen.getByRole('button', { name: words.habits.listOptions }))
    fireEvent.click(await screen.findByRole('menuitem', { name: words.habits.frequencyFilter }))
    expect(await screen.findByRole('dialog', { name: words.habits.frequencyFilter })).toBeVisible()
    expect(document.querySelector('.orbit-sheet-title')).toHaveTextContent(words.common.options)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  }
  await openFrequencies()
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: words.habits.filter.monthly }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await openFrequencies()
  expect(screen.getByRole('menuitemcheckbox', { name: words.habits.filter.monthly })).toBeChecked()
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name: words.habits.filter.monthly }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(useUIStore.getState().activeFilters.frequencyUnit).toBeUndefined()
  rendered.unmount()
})
