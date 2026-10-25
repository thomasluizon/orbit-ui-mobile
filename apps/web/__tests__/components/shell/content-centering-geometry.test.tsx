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
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { bundleGeometry } from '@/__tests__/support/profile-settings-browser'
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

function floatingNotice(state: string) {
  if (state === 'absent') return undefined
  if (state === 'empty') return <></>
  return <div style={{ minHeight: state === 'tall' ? 160 : undefined }}><Toast kind="neutral" message="Saved" /></div>
}

function expectCentred(bounds: { left: number; right: number }, container: { left: number; right: number }) {
  expect.soft(Math.abs(bounds.left + bounds.right - container.left - container.right)).toBeLessThanOrEqual(2)
}

describe('page content centring and add control clearance', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let shortShellScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    shortShellScript = bundleGeometry(`import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { NextIntlClientProvider } from 'next-intl';
      import { ShellWide } from './components/shell/shell-wide';
      import { DestinationHeaderRow } from './components/navigation/root-notification-header';
      import { Composer } from './components/shell/composer';
      import { BottomTabBar } from './components/navigation/bottom-tab-bar';
      import { Fab } from './components/ui/fab';
      import { Toast } from './components/ui/toast';
      import words from '../../packages/shared/src/i18n/pt-BR.json';
      const configuration = JSON.parse(document.getElementById('root').dataset.configuration);
      const items = ['hoje', 'calendario', 'progresso', 'perfil'].map(id => ({ id, href: '/', label: id, icon: () => <span style={{ width: 24, height: 24 }} /> }));
      const noop = () => {};
      createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="pt-BR" messages={words}>
        <ShellWide items={items.map(({ id, href, label }) => ({ id, href, label, icon: id }))} activeId="hoje" navLabel="Navegação" astraRow={{ label: 'Astra', onOpen: noop }}
          header={<DestinationHeaderRow><button type="button" style={{ height: 48 }}>Hoje</button></DestinationHeaderRow>}
          notice={configuration.pressure ? <div style={{ minHeight: 160 }}><Toast kind="neutral" message="Saved" /></div> : undefined}
          composer={<Composer state="idle" value="Ler" suggestions={[]} words={words.shell.composer}
            onChangeValue={noop} onSend={noop} onAttachFile={noop}
            attachWords={{ ...words.shell.composer.attach, remove: name => name }} onOpenConversation={noop} conversationLabel="Astra" />}
          fab={<Fab label="Criar" onClick={noop}>+</Fab>}
          tabBar={<BottomTabBar items={items} activeId="hoje" onSelect={noop} label="Navegação" />}>
          {Array.from({ length: 40 }, (_, index) => <button key={index} type="button" style={{ display: 'block', height: 48 }}>{index}</button>)}
        </ShellWide>
      </NextIntlClientProvider>);`, {
      'next/link': "import React from 'react'; export default ({ children, ...props }) => React.createElement('a', props, children);",
      '@sentry/nextjs': 'export const captureException = () => {};',
      '@/stores/auth-store': 'import { create } from "zustand"; export const useAuthStore = create(() => ({ isAuthenticated: true, user: { userId: "shell-account" }, logout: async () => {} }));',
      './notification-bell': 'export const NotificationBell = () => null;',
      '@/components/ui/dropdown-menu': 'export const Root = ({children}) => children; export const Trigger = ({children}) => children; export const Content = () => null;',
      '@/components/ui/sheet': 'export const Sheet = () => null; export const useSheetHost = () => ({});',
    })
  })
  afterEach(cleanup)
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([412, 480, 740, 840, 1100, 841, 1101])('centres columns within their usable containers at %ipx', async (width) => {
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
        expect.soft(column.left + column.right, JSON.stringify(column)).toBeCloseTo(column.availableLeft + column.availableRight, 1)
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

  it.each([{ width: 840, height: 240 }, { width: 360, height: 320 }, { width: 740, height: 360 }, { width: 844, height: 390 }].flatMap(viewport =>
    [{ top: 0, bottom: 0, left: 0, right: 0 }, { top: 24, bottom: 16, left: 0, right: 0 }].map(insets => ({ ...viewport, ...insets })),
  ).concat([{ width: 844, height: 390, top: 0, bottom: 21, left: 44, right: 44 }]).flatMap(viewport => [false, true].map(pressure => ({ ...viewport, pressure }))))(
    'keeps the real composer and bottom controls reachable at $width by $height with insets $top/$bottom, pressure=$pressure', async (viewport) => {
      const page = await browser.newPage({ viewport })
      try {
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: viewport.top, bottom: viewport.bottom, left: viewport.left, right: viewport.right } })
        await page.setContent(`<style>${stylesheet}:root{font-size:${viewport.pressure ? 32 : 16}px}</style><div id="root"></div>`)
        await page.locator('#root').evaluate((element, pressure) => { element.dataset.configuration = JSON.stringify({ pressure }) }, viewport.pressure)
        const renderError = page.waitForEvent('pageerror').then(error => { throw error })
        await Promise.race([
          page.addScriptTag({ content: shortShellScript }).then(() => page.locator('[data-shell-tab-bar]').waitFor({ state: 'visible' })),
          renderError,
        ])
        await page.evaluate(() => new Promise<void>(resolve => {
          const observer = new ResizeObserver(() => { observer.disconnect(); resolve() })
          observer.observe(document.querySelector('[data-shell-header]')!)
        }))
        const settled = await page.evaluate(() => ({
          bottom: document.querySelector('[data-shell-bottom]')!.getBoundingClientRect().bottom,
          tabsBottom: document.querySelector('[data-shell-tab-bar]')!.getBoundingClientRect().bottom,
          bottomHeight: document.querySelector('[data-shell-bottom-viewport]')!.getBoundingClientRect().height,
          pageHeight: document.querySelector('[data-shell-scroller]')!.getBoundingClientRect().height,
        }))
        expect.soft(settled.bottom, 'settled trailing chrome stays inside the safe viewport').toBeLessThanOrEqual(viewport.height - viewport.bottom)
        expect.soft(settled.tabsBottom, 'settled actual tabs stay inside the safe viewport').toBeLessThanOrEqual(viewport.height - viewport.bottom)
        expect(settled.bottomHeight, 'bottom controls yield before the protected page').toBe(viewport.pressure ? 80 : 64)
        expect(settled.pageHeight).toBeGreaterThanOrEqual(192)
        const headerControl = page.locator('[data-shell-header] button')
        await headerControl.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
        const headerBounds = (await headerControl.boundingBox())!
        expect.soft(headerBounds.y, 'outer recovery reveals the complete header').toBeGreaterThanOrEqual(viewport.top)
        expect(headerBounds.height).toBeGreaterThanOrEqual(48)
        expect(headerBounds.y + headerBounds.height).toBeLessThanOrEqual(viewport.height - viewport.bottom)
        const geometry = await page.evaluate(() => {
          const box = (element: Element) => { const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom, height: bounds.height } }
          const pinned = document.querySelector<HTMLElement>('[data-shell-pinned-slot]')!
          const viewport = document.querySelector<HTMLElement>('[data-shell-bottom-viewport]')!
          const controls = [...viewport.querySelectorAll('textarea, button')].map(control => {
            control.scrollIntoView({ block: 'nearest', behavior: 'instant' })
            const bounds = control.getBoundingClientRect()
            const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            return { control: box(control), viewport: box(viewport), label: control.getAttribute('aria-label'), hit: target === control || control.contains(target) }
          })
          return { pinned: box(pinned), viewport: box(viewport), controls, header: box(document.querySelector('[data-shell-header]')!),
            scroller: box(document.querySelector('[data-shell-scroller]')!), fab: box(document.querySelector('[data-fab]')!),
            tabs: box(document.querySelector('[data-shell-tab-bar]')!) }
        })
        expect(geometry.pinned.height).toBeGreaterThanOrEqual(56)
        expect(geometry.viewport.height).toBeGreaterThanOrEqual(64)
        expect(geometry.controls.length).toBeGreaterThanOrEqual(4)
        for (const { control, viewport, label, hit } of geometry.controls) {
          expect(control.top, label ?? '').toBeGreaterThanOrEqual(viewport.top)
          expect(control.bottom, label ?? '').toBeLessThanOrEqual(viewport.bottom)
          expect(hit).toBe(true)
        }
        expect(geometry.viewport.top).toBeGreaterThanOrEqual(geometry.header.bottom)
        expect(geometry.viewport.top).toBeGreaterThanOrEqual(geometry.scroller.bottom)
        expect(geometry.fab.bottom).toBeLessThanOrEqual(geometry.viewport.top - 16)
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
          const actions = [...document.querySelectorAll('[data-slot="action-row"] button')].map((button) => {
            const bounds = button.getBoundingClientRect()
            return { ...box(button), centre: bounds.top + bounds.height / 2 }
          })
          const lines = [...new Set(actions.map(({ centre }) => centre))].map((centre) => {
            const row = actions.filter((action) => action.centre === centre)
            return { left: Math.min(...row.map((action) => action.left)), right: Math.max(...row.map((action) => action.right)) }
          })
          return { column, lines, form: box(document.querySelector('form')!), submit: box(document.querySelector('[data-habit-create-action] button')!) }
        })
        const astraAction = page.getByRole('button', { name: messages.habits.askAstra, exact: true })
        expect(await astraAction.textContent()).toBe(messages.habits.askAstra)
        expect(await astraAction.locator('[data-asset^="astra-mark"]').count()).toBe(1)
        const target = await astraAction.boundingBox()
        expect(target!.width).toBeGreaterThan(48)
        expect(target!.x + target!.width).toBeLessThanOrEqual(viewport.width)
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

  it.each([320, 412])('reveals intermediate habit actions through forward and backward Tab at %ipx', async (width) => {
    const habits = normalizeHabits(Array.from({ length: 40 }, (_, index) => makeHabitScheduleItem({ id: `focus-${index}`, title: `Read chapter ${index}` })))
    for (const withNotice of [false, true]) {
      const { container, unmount } = render(<NextIntlClientProvider locale="en" messages={en}><ShellWide items={[]} activeId="hoje" navLabel="Navigation" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
        notice={withNotice ? <Toast kind="neutral" message="Saved" /> : undefined}
        composer={<Composer state="idle" value="Draft" suggestions={[]} words={en.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />}
        fab={<Fab label="Create" onClick={vi.fn()}>+</Fab>} tabBar={<div style={{ height: 80 }} />}>
        <div className="flex flex-col gap-3 px-4">{[...habits.values()].map(habit => <HabitRow key={habit.id} habit={habit} actions={{ onDetail: vi.fn(), onLog: vi.fn(), onEdit: vi.fn() }} />)}</div>
      </ShellWide></NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        for (const backward of [false, true]) {
          const before = await page.evaluate((backward) => {
            const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
            const row = scroller.querySelectorAll('[data-testid="habit-row"]')[15]!
            const check = row.querySelector<HTMLElement>('[data-habit-row-control="check"]')!
            const menu = row.querySelector<HTMLElement>('[data-habit-row-control="menu"]')!
            const target = backward ? check : menu
            const fab = document.querySelector('[data-fab]')!.getBoundingClientRect()
            scroller.scrollTop += target.getBoundingClientRect().top - (fab.top + 6)
            ;(backward ? menu : check).focus({ preventScroll: true })
            const bounds = target.getBoundingClientRect()
            return { top: bounds.top, bottom: bounds.bottom, fabTop: fab.top, fabBottom: fab.bottom, offset: scroller.scrollTop }
          }, backward)
          expect(before.top).toBeGreaterThanOrEqual(before.fabTop)
          expect(before.bottom).toBeLessThanOrEqual(before.fabBottom)
          await page.keyboard.press(backward ? 'Shift+Tab' : 'Tab')
          const after = await page.evaluate((backward) => {
            const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
            const row = scroller.querySelectorAll('[data-testid="habit-row"]')[15]!
            const target = row.querySelector<HTMLElement>(`[data-habit-row-control="${backward ? 'check' : 'menu'}"]`)!
            const bounds = target.getBoundingClientRect()
            const fab = document.querySelector('[data-fab]')!.getBoundingClientRect()
            return { focused: document.activeElement === target, indicator: target.matches(':focus-visible'), top: bounds.top, bottom: bounds.bottom,
              width: bounds.width, height: bounds.height, viewportTop: scroller.getBoundingClientRect().top, fabTop: fab.top, offset: scroller.scrollTop,
              hit: target.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)) }
          }, backward)
          expect(after.focused).toBe(true)
          expect(after.indicator).toBe(true)
          expect(after.width).toBeGreaterThanOrEqual(48)
          expect(after.height).toBeGreaterThanOrEqual(48)
          expect(after.top).toBeGreaterThanOrEqual(after.viewportTop)
          expect(after.bottom).toBeLessThanOrEqual(after.fabTop - 16)
          expect(after.hit).toBe(true)
          expect(after.offset).toBeGreaterThan(before.offset)
          await page.keyboard.press(backward ? 'Tab' : 'Shift+Tab')
          expect(await page.locator('[data-shell-scroller]').evaluate(element => element.scrollTop)).toBe(after.offset)
        }
      } finally { await page.close(); unmount() }
    }
  })

  it.each([
    ...windows.map(viewport => ({ ...viewport, mode: 'dark' as const, words: ptBR, textScale: 1, noticeState: 'absent' })),
    ...[320, 412].flatMap(width => (['dark', 'light'] as const).flatMap(mode => [en, ptBR].flatMap(words =>
      [1, 2].flatMap(textScale => ['absent', 'empty', 'notice', 'tall'].map(noticeState => ({ width, height: 915, mode, words, textScale, noticeState }))),
    ))),
  ])('lets real rows pass beneath the floating target and clear it at scroll end at $width/$height/$mode/$textScale/$noticeState', async ({ mode, words, textScale, noticeState, ...viewport }) => {
    const habits = normalizeHabits(Array.from({ length: 40 }, (_, index) => makeHabitScheduleItem({ id: `floating-${index}`, title: `Read chapter ${index}` })))
    const notice = floatingNotice(noticeState)
    const { container } = render(<NextIntlClientProvider locale={words === en ? 'en' : 'pt-BR'} messages={words}><ShellWide items={[]} activeId="hoje" navLabel="Navegação" astraRow={{ label: 'Astra', onOpen: vi.fn() }}
      notice={notice} composer={<Composer state="idle" value="" suggestions={[]} words={words.shell.composer} onChangeValue={vi.fn()} onSend={vi.fn()} />}
      fab={<Fab label="Criar" onClick={vi.fn()}>+</Fab>} tabBar={<div style={{ height: 80 }} />}>
      <div className="flex flex-col gap-3 px-4">{[...habits.values()].map(habit => <HabitRow key={habit.id} habit={habit} actions={{ onDetail: vi.fn(), onLog: vi.fn(), onEdit: vi.fn() }} />)}</div>
    </ShellWide></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet}:root{${theme};font-size:${16 * textScale}px}</style>${container.innerHTML}`)
      await loadAppFonts(page)
      for (const position of ['start', 'middle', 'end'] as const) {
        const geometry = await page.evaluate((position) => {
          const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
          scroller.scrollTop = position === 'end' ? scroller.scrollHeight : position === 'middle' ? scroller.scrollHeight / 2 : 0
          const fab = document.querySelector('[data-fab]')!.getBoundingClientRect()
          const viewport = scroller.getBoundingClientRect()
          const rows = [...scroller.querySelectorAll('[data-testid="habit-row"]')]
          const last = rows.at(-1)!
          const lastControls = [...last.querySelectorAll('[data-habit-row-control="check"], [data-habit-row-control="menu"]')].map(control => {
            const bounds = control.getBoundingClientRect()
            return { bottom: bounds.bottom, hit: control.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)) }
          })
          const row = rows.find(row => { const bounds = row.getBoundingClientRect(); return Math.min(bounds.bottom - 8, fab.bottom) > Math.max(bounds.top + 8, fab.top) })
          const freePoints = row ? (() => {
            const bounds = row.getBoundingClientRect()
            const y = (Math.max(bounds.top + 8, fab.top) + Math.min(bounds.bottom - 8, fab.bottom)) / 2
            return [bounds.left + 24, bounds.left + bounds.width / 3, fab.left - 16].map(x => ({ x, y, hit: row.contains(document.elementFromPoint(x, y)) }))
          })() : []
          const overlay = document.querySelector('[data-shell-fab-clip]')!
          const paintOwners = [overlay, ...overlay.querySelectorAll('*')]
          for (let ancestor = overlay.parentElement; ancestor && !ancestor.hasAttribute('data-shell-page'); ancestor = ancestor.parentElement) paintOwners.push(ancestor)
          const opaqueFreeSpace = paintOwners.some(owner => {
            const bounds = owner.getBoundingClientRect()
            const color = getComputedStyle(owner).backgroundColor
            return color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' && freePoints.some(({ x, y }) => x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom)
          })
          return { fab: { width: fab.width, top: fab.top, bottom: fab.bottom }, viewport: { top: viewport.top, bottom: viewport.bottom },
            pinnedTop: document.querySelector('[data-shell-bottom]')!.getBoundingClientRect().top,
            lastBottom: last.getBoundingClientRect().bottom, lastControls, freePoints, opaqueFreeSpace }
        }, position)
        if (viewport.width >= 1024) { expect(geometry.fab.width).toBe(0); continue }
        expect(geometry.fab.width).toBe(60)
        expect(geometry.viewport.bottom).toBe(geometry.pinnedTop)
        expect(geometry.fab.top).toBeGreaterThanOrEqual(geometry.viewport.top)
        expect(geometry.fab.bottom).toBeLessThanOrEqual(geometry.viewport.bottom - 16)
        if (position === 'end') {
          expect(geometry.lastBottom).toBeLessThanOrEqual(geometry.fab.top - 16)
          expect(geometry.lastControls).toHaveLength(2)
          for (const control of geometry.lastControls) { expect(control.bottom).toBeLessThanOrEqual(geometry.fab.top - 16); expect(control.hit).toBe(true) }
        } else {
          expect(geometry.freePoints).toHaveLength(3)
          for (const point of geometry.freePoints) expect(point.hit).toBe(true)
          expect(geometry.opaqueFreeSpace).toBe(false)
        }
      }
    } finally { await page.close() }
  })
})
