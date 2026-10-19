import { act, fireEvent, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { expect as expectBrowser } from '@playwright/test'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { DestinationShell } from '@/components/shell/destination-shell'
import { openTodayListOptions } from '@/e2e/layout/hydration-guard'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '../support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

const noop = () => {}

function surface(locale: 'en' | 'pt-BR', isFetching = false) {
  const words = locale === 'en' ? en : ptBr
  return <NextIntlClientProvider locale={locale} messages={words}>
    <DestinationShell onCreate={noop}>
      <TodayDateControl dayName={words.dates.today} numericDate="04/09" isTodaySelected nextDisabled={false}
        previousLabel={words.dates.previousDay} goToTodayLabel={words.dates.goToToday}
        nextLabel={words.dates.nextDay} moreLabel={words.habits.listOptions} menuHeading={words.common.options}
        selectLabel={words.common.select} collapseLabel={words.habits.collapseAll} allCollapsed={false}
        refreshLabel={words.habits.refresh} completedLabel={words.habits.showCompleted} showCompleted={false}
        isFetching={isFetching} searchLabel={words.habits.search.title} onSearch={noop}
        onToggleSelect={noop} onToggleCollapse={noop} onRefresh={noop} onToggleCompleted={noop}
        onGoToPreviousDay={noop} onGoToToday={noop} onGoToNextDay={noop} />
    </DestinationShell>
  </NextIntlClientProvider>
}

function serverContainer(locale: 'en' | 'pt-BR') {
  const container = document.createElement('div')
  container.innerHTML = renderToString(surface(locale))
  document.body.append(container)
  return container
}

describe('Today list options hydration', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it('loses a server HTML click and keeps a hydrated menu open through refetch renders', async () => {
    const container = serverContainer('en')
    const trigger = within(container).getByRole('button', { name: en.habits.listOptions })
    let root: Root | undefined
    try {
      expect(trigger.closest('[data-shell-header]')).toBeNull()
      fireEvent.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await act(async () => { root = hydrateRoot(container, surface('en')) })
      expect(within(container).queryByRole('menu')).toBeNull()
      expect(trigger.closest('[data-shell-header]')).not.toBeNull()
      fireEvent.pointerDown(trigger)
      fireEvent.click(trigger)
      const menu = await within(document.body).findByRole('menu', { name: en.habits.listOptions })
      for (const isFetching of [true, false]) {
        await act(async () => { root?.render(surface('en', isFetching)) })
        expect(within(document.body).getByRole('menu', { name: en.habits.listOptions })).toBe(menu)
        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(within(menu).getByRole('menuitem', { name: en.habits.refresh }).hasAttribute('disabled')).toBe(isFetching)
      }
    } finally {
      await act(async () => root?.unmount())
      container.remove()
    }
  })

  it.each([['en', 360], ['pt-BR', 320]] as const)('waits for hydration before one %s press at %ipx', async (locale, width) => {
    const words = locale === 'en' ? en : ptBr
    const container = serverContainer(locale)
    const trigger = within(container).getByRole('button', { name: words.habits.listOptions })
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    let root: Root | undefined
    let presses = 0
    let opening: Promise<void> | undefined
    const synchronize = async () => {
      await page.setContent(document.body.innerHTML)
      await page.evaluate((label) => {
        document.addEventListener('click', (event) => {
          if (!(event.target instanceof Element) || !event.target.closest(`button[aria-label="${label}"]`)) return
          void (window as unknown as { pressTodayOptions: () => Promise<void> }).pressTodayOptions()
        })
      }, words.habits.listOptions)
    }
    try {
      await page.exposeFunction('pressTodayOptions', async () => {
        presses += 1
        fireEvent.pointerDown(trigger)
        fireEvent.click(trigger)
        await synchronize()
      })
      await synchronize()
      await expectBrowser(page.getByRole('button', { name: words.habits.listOptions })).toBeVisible()
      opening = openTodayListOptions(page, words.habits.listOptions)
      const settledBeforeHydration = await Promise.race([
        opening.then(() => true),
        new Promise<false>((resolve) => { setTimeout(() => resolve(false), 150) }),
      ])
      expect(settledBeforeHydration, 'opening must remain pending while hydration is withheld').toBe(false)
      expect(presses, 'server HTML must receive no press').toBe(0)
      await act(async () => { root = hydrateRoot(container, surface(locale)) })
      await synchronize()
      await opening
      await expectBrowser(page.getByRole('menu', { name: words.habits.listOptions })).toBeVisible()
      expect(presses).toBe(1)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    } finally {
      await page.close()
      await opening?.catch(() => {})
      await act(async () => root?.unmount())
      container.remove()
    }
  })
})
