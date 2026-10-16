import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { launchChrome, closeChrome } from '@/__tests__/support/chromium'
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

function renderControl(locale: string, words: typeof en | typeof ptBr) {
  return render(<NextIntlClientProvider locale={locale} messages={words}>
    <TodayDateControl dayName={words.dates.today} numericDate="04/09" isTodaySelected nextDisabled={false}
      previousLabel={words.dates.previousDay} todayLabel={words.dates.today} goToTodayLabel={words.dates.goToToday}
      nextLabel={words.dates.nextDay} moreLabel={words.habits.listOptions} menuHeading={words.common.options}
      selectLabel={words.common.select} collapseLabel={words.habits.collapseAll} allCollapsed={false}
      refreshLabel={words.habits.refresh} completedLabel={words.habits.showCompleted} showCompleted={false}
      isFetching={false} searchLabel={words.habits.search.title} onSearch={noop}
      onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
      onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />
  </NextIntlClientProvider>)
}

it.each([['en', en], ['pt-BR', ptBr]] as const)('opens the %s frequency sheet after closing list options', async (locale, words) => {
  const rendered = renderControl(locale, words)
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

it.each([0, 44])('keeps every landscape menu choice reachable inside safe inset %s', async (inset) => {
  renderControl('en', en)
  fireEvent.click(screen.getByRole('button', { name: en.habits.listOptions }))
  const options = await screen.findByRole('dialog', { name: en.habits.listOptions })
  const optionsHtml = options.outerHTML
  fireEvent.click(screen.getByRole('menuitem', { name: en.habits.frequencyFilter }))
  const frequencies = await screen.findByRole('dialog', { name: en.habits.frequencyFilter })
  const cssPath = resolve('app/globals.css')
  const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
  const launch = launchChrome()
  try {
    const browser = await launch
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } })
    for (const [html, role, count] of [[optionsHtml, 'menuitem', 5], [frequencies.outerHTML, 'menuitemcheckbox', 6]] as const) {
      await page.setContent(`<style>${stylesheet.css}</style><div class="orbit-sheet-portal"><div class="orbit-sheet-viewport">${html}</div></div>`)
      await page.evaluate(({ inset }) => {
        for (const edge of ['left', 'right']) document.documentElement.style.setProperty(`--safe-${edge}`, `${inset}px`)
        document.documentElement.style.setProperty('--safe-bottom', inset ? '21px' : '0px')
        document.getAnimations().forEach((animation) => animation.finish())
      }, { inset })
      const items = page.getByRole(role)
      expect(await items.count()).toBe(count)
      const scroller = page.locator('.orbit-sheet-body')
      expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      for (const item of await items.all()) {
        await item.scrollIntoViewIfNeeded()
        const bounds = (await item.boundingBox())!
        expect(bounds.x).toBeGreaterThanOrEqual(inset)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(844 - inset)
        expect(bounds.y).toBeGreaterThanOrEqual(0)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(390 - (inset ? 21 : 0))
      }
    }
  } finally { await closeChrome(launch) }
}, 45_000)
