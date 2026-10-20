import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { act, cleanup, render } from '@testing-library/react'
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
import { Composer } from '@/components/shell/composer'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { Fab } from '@/components/ui/fab'
import { Toast } from '@/components/ui/toast'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { HabitRow } from '@/components/habits/habit-row'
import { makeHabitScheduleItem } from '@orbit/shared/test-support/habit-detail-fixtures'
import { normalizeHabits } from '@orbit/shared/utils'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-habit-create-navigation-guard', () => ({ useHabitCreateNavigationGuard: () => {} }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellComposerSlot: () => {} }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

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

  it.each([412, 480, 740, 840, 1100, 841, 1101])('places centred columns on whole CSS pixels at %ipx', async (width) => {
    const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <ShellWide items={[]} activeId="hoje" navLabel="Navegação" astraRow={{ label: 'Astra', onOpen: vi.fn() }}>
        <HabitCreateFrame presentation="screen" open fromConversation={false} leaving={false} actionRefreshKey="test" onNavigate={vi.fn()} onReturn={vi.fn()}
          actions={<HabitCreateActions presentation="screen" pending={false} empty={false} subHabit={false} online formId="create" onCancel={vi.fn()} />}>
          <form id="create"><label>Hábito<input /></label></form>
        </HabitCreateFrame>
      </ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const columns = await page.evaluate(() => [...document.querySelectorAll('[data-shell-column], [data-habit-create-screen], [data-habit-create-action]')].map(element => {
        const bounds = element.getBoundingClientRect()
        const parent = element.parentElement!
        const available = parent.getBoundingClientRect()
        const style = getComputedStyle(parent)
        return { left: bounds.left, right: bounds.right, availableLeft: available.left + parseFloat(style.paddingLeft),
          availableRight: available.left + parent.clientWidth - parseFloat(style.paddingRight) }
      }))
      expect(columns).toHaveLength(3)
      for (const column of columns) {
        expect.soft(Number.isInteger(column.left), JSON.stringify(column)).toBe(true)
        expectCentred(column, { left: column.availableLeft, right: column.availableRight })
      }
    } finally { await page.close() }
  })

  it.each([412, 1352].flatMap(width => [false, true].map(floating => ({ width, floating }))))(
    'aligns the notice with its measurable parent at $width, floating=$floating', async ({ width, floating }) => {
      const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
        <ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
          notice={<Toast kind="neutral" message="Habit deleted" actionLabel="Undo" onAction={vi.fn()} />}
          fab={floating ? <Fab label="Create" onClick={vi.fn()}>+</Fab> : undefined}>
          <div style={{ height: 1600 }} />
        </ShellWide>
      </NextIntlClientProvider>)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const geometry = await page.evaluate(() => {
          const notice = document.querySelector('[data-shell-notice]')!
          const parent = notice.parentElement!.getBoundingClientRect()
          const toast = notice.querySelector('[data-kind]')!.getBoundingClientRect()
          const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          const gutter = scroller.offsetWidth - scroller.clientWidth
          return { parent: { left: parent.left, right: parent.right, width: parent.width }, toast: { left: toast.left, right: toast.right }, gutter }
        })
        expect(geometry.parent.width).toBeGreaterThan(0)
        expect(geometry.toast.left).toBe(geometry.parent.left + 16)
        const parentGutter = floating && width < 1024 ? 0 : geometry.gutter
        expect(geometry.toast.right).toBe(geometry.parent.right - 16 - parentGutter)
      } finally { await page.close() }
    },
  )

  it.each([1024, 1352])('keeps the wide destination wrapper outside focus clipping at %ipx', async (width) => {
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
      <ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
        fab={<Fab label="Create" onClick={vi.fn()}>+</Fab>}>
        <TodayAstraLine text="Review your routine" destination="Astra" onPress={vi.fn()} />
      </ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const overflow = await page.evaluate(() => {
        const viewport = document.querySelector('[data-shell-destination-viewport]')!
        const style = getComputedStyle(viewport)
        return { display: style.display, x: style.overflowX, y: style.overflowY }
      })
      expect(overflow).toEqual({ display: 'contents', x: 'visible', y: 'visible' })
    } finally { await page.close() }
  })

  it.each([240, 360])('reveals complete page controls after centred scrolling at 740 by %ipx', async (height) => {
    const habits = normalizeHabits(Array.from({ length: 12 }, (_, index) => makeHabitScheduleItem({ id: `habit-${index}`, title: 'Read a longer book chapter '.repeat(4) })))
    const { container } = render(<NextIntlClientProvider locale="en" messages={en}>
      <ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
        header={<div style={{ height: 48 }} />}
        composer={<Composer state="idle" value="Read" suggestions={[]} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
          attachWords={{ ...en.shell.composer.attach, remove: name => name }} onOpenConversation={vi.fn()} conversationLabel="Astra" />}
        fab={<Fab label="Create" onClick={vi.fn()}>+</Fab>} tabBar={<div style={{ height: 80 }} />}>
        <div style={{ height: 0.5 }} />
        <TodayDateControl dayName="Friday" numericDate="04/09/2026" isTodaySelected={false} nextDisabled={false}
          previousLabel="Previous day" goToTodayLabel="Today" nextLabel="Next day" moreLabel="Options" searchLabel="Search"
          selectLabel="Select" collapseLabel="Collapse" refreshLabel="Refresh" completedLabel="Completed" allCollapsed={false} showCompleted isFetching={false}
          onGoToPreviousDay={vi.fn()} onGoToToday={vi.fn()} onGoToNextDay={vi.fn()} onSearch={vi.fn()}
          onToggleSelect={vi.fn()} onToggleCollapse={vi.fn()} onRefresh={vi.fn()} onToggleCompleted={vi.fn()} />
        {[...habits.values()].map(habit => <HabitRow key={habit.id} habit={habit} actions={{ onDetail: vi.fn() }} />)}
      </ShellWide>
    </NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width: 740, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      const controls = await page.evaluate(() => {
        const scroller = document.querySelector('[data-shell-scroller]')!
        return [...scroller.querySelectorAll('button')].map(control => {
          control.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
          const bounds = control.getBoundingClientRect()
          const viewport = scroller.getBoundingClientRect()
          return { label: control.getAttribute('aria-label') ?? control.textContent, top: bounds.top, bottom: bounds.bottom, height: bounds.height, viewportTop: Math.max(0, viewport.top), viewportBottom: Math.min(innerHeight, viewport.bottom), viewportHeight: viewport.height }
        })
      })
      expect(controls.length).toBeGreaterThanOrEqual(17)
      for (const control of controls) {
        expect.soft(control.viewportHeight, control.label).toBeGreaterThanOrEqual(control.height + 8)
        expect.soft(control.top, control.label).toBeGreaterThanOrEqual(control.viewportTop)
        expect.soft(control.bottom, control.label).toBeLessThanOrEqual(control.viewportBottom)
      }
    } finally { await page.close() }
  })

  it.each([{ width: 840, height: 240 }, { width: 360, height: 320 }].flatMap(viewport =>
    [{ top: 0, bottom: 0 }, { top: 24, bottom: 16 }].map(insets => ({ ...viewport, ...insets })),
  ))(
    'keeps the real composer and bottom controls reachable at $width by $height with insets $top/$bottom', async (viewport) => {
      const items = ['hoje', 'calendario', 'progresso', 'perfil'].map(id => ({ id, href: '/', label: id, icon: () => <span style={{ width: 24, height: 24 }} /> }))
      const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}>
        <ShellWide items={items.map(({ id, href, label }) => ({ id, href, label, icon: id }))} activeId="hoje" navLabel="Navegação" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
          header={<button type="button" style={{ height: 48 }}>Hoje</button>}
          composer={<Composer state="idle" value="Ler" suggestions={[]} words={ptBR.shell.composer}
            onChangeValue={vi.fn()} onSend={vi.fn()} onAttachFile={vi.fn()}
            attachWords={{ ...ptBR.shell.composer.attach, remove: name => name }} onOpenConversation={vi.fn()} conversationLabel="Astra" />}
          fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>}
          tabBar={<BottomTabBar items={items} activeId="hoje" onSelect={vi.fn()} label="Navegação" />}>
          {Array.from({ length: 40 }, (_, index) => <button key={index} type="button" style={{ display: 'block', height: 48 }}>{index}</button>)}
        </ShellWide>
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport })
      try {
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: viewport.top, bottom: viewport.bottom, left: 0, right: 0 } })
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const geometry = await page.evaluate(() => {
          const box = (element: Element) => { const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, height: bounds.height } }
          const pinned = document.querySelector<HTMLElement>('[data-shell-pinned-slot]')!
          const viewport = document.querySelector<HTMLElement>('[data-shell-bottom-viewport]')!
          const controls = [...viewport.querySelectorAll('textarea, button')].map(control => {
            control.scrollIntoView({ block: 'nearest', behavior: 'instant' })
            const bounds = control.getBoundingClientRect()
            const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            return { control: box(control), hit: target === control || control.contains(target) }
          })
          return { pinned: box(pinned), viewport: box(viewport), controls, header: box(document.querySelector('[data-shell-header]')!),
            scroller: box(document.querySelector('[data-shell-scroller]')!), fab: box(document.querySelector('[data-fab]')!),
            tabs: box(document.querySelector('[data-shell-tab-bar]')!) }
        })
        expect(geometry.pinned.height).toBeGreaterThanOrEqual(56)
        expect(geometry.viewport.height).toBeGreaterThanOrEqual(64)
        expect(geometry.controls.length).toBeGreaterThanOrEqual(4)
        for (const { control, hit } of geometry.controls) {
          expect(control.top).toBeGreaterThanOrEqual(geometry.viewport.top)
          expect(control.bottom).toBeLessThanOrEqual(geometry.viewport.bottom)
          expect(hit).toBe(true)
        }
        expect(geometry.viewport.top).toBeGreaterThanOrEqual(geometry.header.bottom)
        expect(geometry.viewport.top).toBeGreaterThanOrEqual(geometry.scroller.bottom)
        expect(geometry.fab.bottom).toBeLessThanOrEqual(geometry.pinned.top)
        const tabs = page.locator('[data-shell-tab-bar]')
        await tabs.evaluate(element => element.scrollIntoView({ block: 'end', behavior: 'instant' }))
        expect(await tabs.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height - viewport.bottom)
      } finally { await page.close() }
    },
  )

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
