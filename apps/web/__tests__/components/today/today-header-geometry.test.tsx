import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 25 }) }))

const noop = () => {}
const props = {
  menuTitle: ptBr.common.options,
  dayName: 'Quarta-feira', shortDayName: 'Qua.', numericDate: '8 abr.', isTodaySelected: false, nextDisabled: false,
  previousLabel: ptBr.dates.previousDay, nextLabel: ptBr.dates.nextDay, todayLabel: ptBr.dates.today,
  goToTodayLabel: ptBr.dates.goToToday, moreLabel: ptBr.habits.listOptions, searchLabel: ptBr.habits.search.title,
  selectLabel: ptBr.common.select, collapseLabel: ptBr.habits.collapseAll, allCollapsed: false,
  refreshLabel: ptBr.habits.refresh, completedLabel: ptBr.habits.showCompleted, showCompleted: false, isFetching: false,
  onGoToPreviousDay: noop, onGoToToday: noop, onGoToNextDay: noop, onSearch: noop,
  onToggleSelect: noop, onToggleCollapse: noop, onRefresh: noop, onToggleCompleted: noop,
}

describe('Hoje header geometry', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    for (const [family, font] of [
      ['Space Grotesk', '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'],
      ['Geist', '@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'],
      ['Geist Mono', '@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf'],
    ] as const) {
      stylesheet += `@font-face { font-family: '${family}'; src: url(data:font/ttf;base64,${readFileSync(require.resolve(font)).toString('base64')}); font-weight: 100 900; }`
    }
    stylesheet += ':root { --font-display: "Space Grotesk"; --font-sans: "Geist"; --font-mono: "Geist Mono"; }'
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([320, 412].flatMap((width) => [1, 2].map((scale) => ({ width, scale }))))('fits both rows at $width px with $scale text scale', async ({ width, scale }) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}><TodayDateControl {...props} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await page.evaluate(async (textScale) => {
        await document.fonts.ready
        document.documentElement.style.fontSize = `${16 * textScale}px`
      }, scale)
      const geometry = await page.evaluate(() => {
        const box = (element: Element) => {
          const rectangle = element.getBoundingClientRect()
          return { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height }
        }
        const date = document.querySelector('[data-today-date-row]')!
        const header = document.querySelector('[data-today-header-actions]')!
        const dateBlock = date.querySelector('[title]')!
        const day = dateBlock.querySelector('p')!
        const visibleDay = Array.from(day.children).find((element) => getComputedStyle(element).display !== 'none')!
        const range = document.createRange()
        range.selectNodeContents(visibleDay)
        return {
          date: box(date), header: box(header), dateBlock: box(dateBlock),
          arrows: Array.from(date.querySelectorAll('button')).map(box),
          actions: Array.from(header.querySelectorAll('button')).map(box),
          dayLines: range.getClientRects().length,
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(geometry.documentWidth).toBe(width)
      expect(geometry.dayLines).toBe(1)
      expect(geometry.arrows[1]!.left - geometry.dateBlock.right).toBeCloseTo(4)
      for (const controls of [geometry.arrows, geometry.actions]) {
        for (const [index, control] of controls.entries()) {
          expect(control.left).toBeGreaterThanOrEqual(0)
          expect(control.right).toBeLessThanOrEqual(width)
          expect(control.width).toBeGreaterThanOrEqual(48)
          expect(control.height).toBeGreaterThanOrEqual(48)
          if (index > 0) expect(control.left - controls[index - 1]!.right).toBeGreaterThanOrEqual(4)
        }
        expect(new Set(controls.map((control) => (control.top + control.bottom) / 2)).size).toBe(1)
      }
    } finally { await page.close() }
  })
  it.each(['en', 'pt-BR'] as const)('fits the open %s menu at 320 pixels and 200 percent text', async (locale) => {
    const messages = locale === 'en' ? en : ptBr
    render(<NextIntlClientProvider locale={locale} messages={messages}><TodayDateControl {...props}
      menuTitle={messages.common.options} moreLabel={messages.habits.listOptions}
      selectLabel={messages.common.select} collapseLabel={messages.habits.collapseAll}
      refreshLabel={messages.habits.refresh} completedLabel={messages.habits.showCompletedMenu} /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: messages.habits.listOptions }))
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${document.body.innerHTML}`)
      await page.evaluate(async () => { await document.fonts.ready; document.documentElement.style.fontSize = '32px' })
      const geometry = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('.orbit-menu-label, .orbit-sheet-title')).map((label) => {
          const range = document.createRange()
          range.selectNodeContents(label)
          return { text: label.textContent, textWidth: range.getBoundingClientRect().width, available: label.getBoundingClientRect().width, lines: range.getClientRects().length }
        })
        const close = document.querySelector('.orbit-sheet-close')!.getBoundingClientRect()
        return { labels, close: { width: close.width, height: close.height } }
      })
      expect(geometry.labels).toHaveLength(5)
      for (const label of geometry.labels) {
        expect(label.textWidth, label.text).toBeLessThanOrEqual(label.available)
        expect(label.lines).toBe(1)
      }
      expect(geometry.close.width).toBeGreaterThanOrEqual(48)
      expect(geometry.close.height).toBeGreaterThanOrEqual(48)
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('refreshes through the header options menu in %s', async (locale) => {
    const messages = locale === 'en' ? en : ptBr
    const refresh = vi.fn()
    render(<NextIntlClientProvider locale={locale} messages={messages}><TodayDateControl {...props}
      menuTitle={messages.common.options} moreLabel={messages.habits.listOptions}
      refreshLabel={messages.habits.refresh} onRefresh={refresh} /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: messages.habits.listOptions }))
    const menu = screen.getByRole('menu', { name: messages.common.options })
    fireEvent.click(within(menu).getByRole('menuitem', { name: messages.habits.refresh }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it.each(['en', 'pt-BR'] as const)('fits the %s clear confirmation at 320 pixels and 200 percent text', async (locale) => {
    const messages = locale === 'en' ? en : ptBr
    render(<NextIntlClientProvider locale={locale} messages={messages}><ConfirmSheet open destructive
      title={messages.notifications.deleteAllAction} minimumActionHeight={48} message={messages.notifications.deleteAllConfirmDescription}
      confirmLabel={messages.notifications.deleteAllAction} onCancel={noop} onConfirm={noop} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${document.body.innerHTML}`)
      await page.evaluate(async () => { await document.fonts.ready; document.documentElement.style.fontSize = '32px' })
      const geometry = await page.evaluate(() => {
        const heading = document.querySelector('.orbit-sheet-title')!
        const range = document.createRange()
        range.selectNodeContents(heading)
        const actions = Array.from(document.querySelectorAll('[data-slot="action-row"] button')).map((button) => {
          const bounds = button.getBoundingClientRect()
          const text = document.createRange()
          text.selectNodeContents(button.querySelector('span')!)
          return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height, lines: text.getClientRects().length }
        })
        return { headingWidth: range.getBoundingClientRect().width, available: heading.getBoundingClientRect().width, lines: range.getClientRects().length, actions }
      })
      expect(geometry.headingWidth).toBeLessThanOrEqual(geometry.available)
      expect(geometry.lines).toBe(1)
      expect(geometry.actions).toHaveLength(2)
      for (const action of geometry.actions) {
        expect(action.left).toBeGreaterThanOrEqual(0)
        expect(action.right).toBeLessThanOrEqual(320)
        expect(action.width).toBeGreaterThanOrEqual(48)
        expect(action.height).toBeGreaterThanOrEqual(48)
        expect(action.lines).toBe(1)
      }
      const [cancel, confirm] = geometry.actions
      expect(cancel!.right <= confirm!.left || cancel!.bottom <= confirm!.top).toBe(true)
    } finally { await page.close() }
  })

})
