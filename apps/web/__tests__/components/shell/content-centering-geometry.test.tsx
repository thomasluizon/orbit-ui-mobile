import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitListEmptyState } from '@/components/habits/habit-list/empty-state'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { CalendarHeader } from '@/app/(app)/calendar/_components/calendar-shell'
import { CalendarStats } from '@/components/calendar/calendar-stats'
import { ProfileSettingsFrame } from '@/components/profile/profile-settings-frame'
import { ShellWide } from '@/components/shell/shell-wide'
import { Fab } from '@/components/ui/fab'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-habit-create-navigation-guard', () => ({ useHabitCreateNavigationGuard: () => {} }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellComposerSlot: () => {} }))

const windows = [320, 360, 412, 480, 840, 1100, 1352, 1440].map((width) => ({ width, height: 915 }))
  .concat([{ width: 1200, height: 1600 }, { width: 1600, height: 1200 }])
const stats = [
  { key: 'best', value: 4, label: ptBR.calendar.bestStreak },
  { key: 'logs', value: 8, label: ptBR.calendar.totalLogs },
  { key: 'missed', value: 2, label: ptBR.calendar.missedCount },
] as const

function expectCentred(bounds: { left: number; right: number }, container: { left: number; right: number }) {
  expect.soft(Math.abs(bounds.left + bounds.right - container.left - container.right)).toBeLessThanOrEqual(2)
}

describe('page content centring and add control clearance', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(windows)('centres Todos actions and the create form at $width by $height', async (viewport) => {
    for (const messages of [ptBR, en]) {
      const { container, unmount } = render(<NextIntlClientProvider locale={messages === en ? 'en' : 'pt-BR'} messages={messages}>
        <ShellWide nav={false}>
          <HabitListEmptyState title={messages.habits.emptyState} description="" actionLabel={messages.habits.createManually} onAction={vi.fn()} askAstraLabel={messages.habits.askAstra} onAskAstra={vi.fn()} />
          <HabitCreateFrame presentation="screen" open fromConversation={false} leaving={false} actionRefreshKey="test" onNavigate={vi.fn()} onReturn={vi.fn()}
            actions={<HabitCreateActions presentation="screen" pending={false} empty={false} subHabit={false} online formId="create" onCancel={vi.fn()} />}>
            <form id="create"><label>Hábito<input /></label></form>
          </HabitCreateFrame>
        </ShellWide>
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.evaluate(() => {
          const box = (element: Element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right } }
          const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          const column = { left: scroller.getBoundingClientRect().left, right: scroller.getBoundingClientRect().left + scroller.clientWidth }
          const actions = [...document.querySelectorAll('[data-slot="action-row"] button')].map((button) => ({ ...box(button), top: button.getBoundingClientRect().top }))
          const lines = [...new Set(actions.map(({ top }) => top))].map((top) => {
            const row = actions.filter((action) => action.top === top)
            return { left: Math.min(...row.map((action) => action.left)), right: Math.max(...row.map((action) => action.right)) }
          })
          return { column, lines, form: box(document.querySelector('form')!), submit: box(document.querySelector('[data-habit-create-action] button')!) }
        })
        expect(geometry.lines.length).toBeGreaterThan(0)
        for (const line of geometry.lines) expectCentred(line, geometry.column)
        expectCentred(geometry.form, geometry.column)
        if (viewport.width < 640) expectCentred(geometry.submit, geometry.column)
        else expect(geometry.submit.left).toBe(geometry.form.left)
      } finally { await page.close(); unmount() }
    }
  })

  it.each(windows)('centres calendar navigation, figures and shared content at $width by $height', async (viewport) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <ShellWide nav={false}>
        <CalendarHeader currentMonth={new Date(2025, 9, 1)} todayKey="2025-10-10" previousMonthLabel="Anterior" nextMonthLabel="Próximo"
          onPreviousMonth={vi.fn()} onNextMonth={vi.fn()} onCurrentMonth={vi.fn()} onSelectMonth={vi.fn()} />
        <div data-day-card="" style={{ marginInline: 16, height: 100 }} />
        <CalendarStats stats={stats} />
        <ProfileSettingsFrame isLoading={false} loadingLabel="Carregando" labels={{}} rows={{}} />
      </ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.evaluate(() => {
        const box = (element: Element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right } }
        const navigation = document.querySelector('[data-testid="calendar-month-navigation"]')!
        const controls = [...navigation.children].map(box)
        const figures = [...document.querySelectorAll('[data-testid="calendar-figures"] > div')].map((figure) => ({ box: box(figure), value: box(figure.firstElementChild!), label: box(figure.lastElementChild!) }))
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        return { column: { left: scroller.getBoundingClientRect().left, right: scroller.getBoundingClientRect().left + scroller.clientWidth }, navigation: { left: Math.min(...controls.map((control) => control.left)), right: Math.max(...controls.map((control) => control.right)) },
          figures, stats: box(document.querySelector('[data-testid="calendar-stats"]')!), card: box(document.querySelector('[data-day-card]')!), frame: box(document.querySelector('[data-testid="profile-settings-groups"]')!) }
      })
      expectCentred(geometry.navigation, geometry.column)
      expectCentred(geometry.stats, geometry.card)
      for (const figure of geometry.figures) { expect(Math.abs(figure.value.left - figure.box.left)).toBeLessThanOrEqual(0.5); expect(Math.abs(figure.label.left - figure.box.left)).toBeLessThanOrEqual(0.5) }
      expectCentred(geometry.frame, geometry.column)
    } finally { await page.close() }
  })

  it.each(windows)('keeps the floating add target outside the scrolling controls at $width by $height', async (viewport) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><ShellWide items={[]} activeId="hoje" navLabel="Navegação" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
      fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>} tabBar={<div style={{ height: 80 }} />}>
      {Array.from({ length: 40 }, (_, index) => <button key={index} type="button" style={{ display: 'block', width: '100%', height: 48 }}>{index}</button>)}
    </ShellWide></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      for (const scrollTop of [0, 480, 1920]) {
        const geometry = await page.evaluate((offset) => {
          const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          scroller.scrollTop = offset
          const fab = document.querySelector('[data-fab]')!.getBoundingClientRect()
          const viewport = scroller.getBoundingClientRect()
          const overlaps = [...scroller.querySelectorAll('button')].filter((button) => {
            const target = button.getBoundingClientRect()
            return fab.width > 0 && Math.max(target.top, viewport.top) < Math.min(fab.bottom, viewport.bottom) && Math.min(target.bottom, viewport.bottom) > fab.top && target.left < fab.right && target.right > fab.left
          }).length
          return { overlaps, fabTop: fab.top, fabWidth: fab.width, scrollerBottom: scroller.getBoundingClientRect().bottom }
        }, scrollTop)
        expect(geometry.overlaps).toBe(0)
        if (geometry.fabWidth > 0) expect(geometry.fabTop).toBeGreaterThanOrEqual(geometry.scrollerBottom)
      }
    } finally { await page.close() }
  })
})
