import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit, createMockNotification } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayAstra } from '@/components/today/today-astra'
import { HabitRow } from '@/components/habits/habit-row'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { TodayDateControl } from '@/app/(app)/today-shell'
import { CalendarOptions } from '@/app/(app)/calendar/_components/calendar-options'
import { RootNotificationHeader } from '@/components/navigation/root-notification-header'
import { NotificationBell } from '@/components/navigation/notification-bell'
import { ShellWide } from '@/components/shell/shell-wide'
import { DestinationShell } from '@/components/shell/destination-shell'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { Menu } from '@/components/ui/menu'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 25 }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: null }) }))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ notifications: [createMockNotification({ url: '/chat', body: 'Sua rotina mudou. Vamos conversar?', createdAtUtc: new Date().toISOString() })] }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

const noop = () => {}
const props = {
  menuHeading: ptBr.common.options,
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

  it.each([320, 360, 384, 412, 1352].flatMap((width) =>
    (['dark', 'light'] as const).flatMap((mode) => ['en', 'pt-BR'].map((locale) => ({ width, mode, locale }))),
  ))('keeps root header icons transparent until interaction at $width in $mode and $locale', async ({ width, mode, locale }) => {
    const messages = locale === 'en' ? en : ptBr
    const surfaces = width < 1024 ? [<TodayDateControl key="today" {...props} isTodaySelected />, <CalendarOptions key="calendar" />,
      <RootNotificationHeader key="progress" />, <RootNotificationHeader key="profile" />] : [
      <TodayDateControl key="today" {...props} isTodaySelected />, <CalendarOptions key="calendar" />,
      <ShellWide key="sidebar" items={[]} activeId="hoje" navLabel={messages.nav.today} notifications={<NotificationBell />}><div /></ShellWide>,
    ]
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      for (const surface of surfaces) {
        const { container, unmount } = render(<NextIntlClientProvider locale={locale} messages={messages}>{surface}</NextIntlClientProvider>)
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
        await page.setContent(`<!doctype html><style>${stylesheet}:root{${variables}}</style>${container.innerHTML}`)
        unmount()
        await page.evaluate((theme) => { document.documentElement.className = theme }, mode)
        const controls = page.locator('[data-today-header-actions] button, [data-testid="calendar-shell-header"] button, [data-root-notification-header] button, [data-shell-sidebar] button[aria-label^="' + messages.notifications.bell + '"]')
        let inspected = 0
        const ordered = await controls.all()
        for (const control of ordered.reverse()) {
          if (!await control.isVisible()) continue
          inspected += 1
          const measure = () => control.evaluate((element) => {
            const style = getComputedStyle(element)
            const bounds = element.getBoundingClientRect()
            return { background: style.backgroundColor, radius: style.borderRadius, width: bounds.width, height: bounds.height }
          })
          expect(await measure()).toMatchObject({ background: 'rgba(0, 0, 0, 0)' })
          const fill = mode === 'dark' ? 'rgba(250, 250, 250, 0.13)' : 'rgba(9, 9, 11, 0.06)'
          await control.hover()
          await expect.poll(async () => (await measure()).background).toBe(fill)
          const hovered = await measure()
          expect(hovered.width).toBeGreaterThanOrEqual(48)
          expect(hovered.height).toBeGreaterThanOrEqual(48)
          expect(Number.parseFloat(hovered.radius)).toBeGreaterThanOrEqual(24)
          await page.mouse.down()
          await expect.poll(async () => (await measure()).background).toBe(fill)
          await page.mouse.move(width - 1, 914)
          await expect.poll(async () => (await measure()).background).toBe(fill)
          await page.mouse.up()
          await control.evaluate((element) => {
            const start = document.createElement('span')
            start.tabIndex = 0
            start.style.position = 'absolute'
            element.before(start)
            start.focus()
          })
          await page.keyboard.press('Tab')
          expect(await control.evaluate((element) => element === document.activeElement)).toBe(true)
          await control.evaluate((element) => element.previousElementSibling?.remove())
          if ((await control.getAttribute('aria-label'))?.startsWith(messages.notifications.bell)) {
            await expect.poll(async () => (await measure()).background).toBe(fill)
            expect(await control.evaluate((element) => Number.parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(2)
          }
          await control.evaluate((element) => (element as HTMLElement).blur())
          await expect.poll(async () => (await measure()).background).toBe('rgba(0, 0, 0, 0)')
        }
        expect(inspected).toBeGreaterThan(0)
      }
    } finally { await page.close() }
  })

  it.each([320, 384, 600].flatMap((width) => [1, 2].flatMap((textScale) => [false, true].map((selectMode) => ({ width, textScale, selectMode })))))(
    'shares two leading edges at $width with $textScale text scale, selecting=$selectMode', async ({ width, textScale, selectMode }) => {
      document.documentElement.style.fontSize = `${16 * textScale}px`
      const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}>
        <TodayAstra today={formatAPIDate(new Date())} isTodaySelected suppressed={false} />
        <TodayDateControl {...props} isTodaySelected />
        <div style={{ paddingInline: 16 }}>
          {(['Leaf', 'Parent', 'Child'] as const).map((title) => <div className="habit-panel" key={title}>
            <HabitRow habit={createMockHabit({ title: `${title} habit with a long name that needs more than one line` })} structuralColumn selectMode={selectMode}
              depth={title === 'Child' ? 1 : 0} hasChildren={title === 'Parent'}
              childProgress={title === 'Parent' ? { done: 0, total: 2 } : undefined}
              meta={title === 'Parent' ? ['0 de 2'] : []}
              actions={{ onEdit: noop, onToggleExpand: noop, onToggleSelection: noop }} />
          </div>)}
        </div>
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate(async (scale) => {
          document.documentElement.style.fontSize = `${16 * scale}px`
          const labels = document.querySelectorAll<HTMLElement>('[data-habit-row-body] > span > span, .today-astra-sentence')
          for (const label of labels) {
            const size = Number.parseFloat(getComputedStyle(label).fontSize)
            label.style.fontSize = `${size * scale}px`
          }
          await document.fonts.ready
        }, textScale)
        const geometry = await page.evaluate(() => {
          const date = document.querySelector('[data-today-date-row] [title] p')!
          const sentence = document.querySelector('.today-astra-sentence')!
          const rows = Array.from(document.querySelectorAll('[data-testid="habit-row"]'))
          const parent = rows[1]!
          const progress = parent.querySelector('.habit-row-meta')!
          const progressText = document.createRange()
          progressText.selectNodeContents(progress)
          const title = (parent.querySelector('[data-habit-row-heading] > div > span') ?? parent.querySelector('[data-habit-row-body] > div > span'))!
          const titleText = document.createRange()
          titleText.selectNodeContents(title)
          const firstTitleLine = titleText.getClientRects()[0]!
          const body = parent.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
          const rowBounds = parent.getBoundingClientRect()
          const bodyBounds = body.getBoundingClientRect()
          const progressBounds = progress.getBoundingClientRect()
          const progressTarget = document.elementFromPoint(progressBounds.left + progressBounds.width / 2, progressBounds.top + progressBounds.height / 2)?.closest('button')
          return {
            primaryTarget: { progress: progressTarget === body, width: bodyBounds.width, height: bodyBounds.height,
              rowWidth: rowBounds.width, rowHeight: rowBounds.height, radius: getComputedStyle(body).borderRadius },
            progress: { width: progressText.getBoundingClientRect().width, available: progress.getBoundingClientRect().width,
              top: progress.getBoundingClientRect().top, titleBottom: title.getBoundingClientRect().bottom },
            parentControls: Array.from(parent.querySelectorAll('[data-habit-row-control]')).map((control) => {
              const bounds = control.getBoundingClientRect()
              const wrapper = body.nextElementSibling!.getBoundingClientRect()
              const centerX = bounds.left + bounds.width / 2
              return { top: bounds.top, bottom: bounds.bottom, firstLineCenter: (firstTitleLine.top + firstTitleLine.bottom) / 2,
                controlHit: document.elementFromPoint(centerX, bounds.top + bounds.height / 2)?.closest('[data-habit-row-control]') === control,
                emptyBandHeight: wrapper.bottom - bounds.bottom,
                emptyBandHitsBody: document.elementFromPoint(centerX, (bounds.bottom + wrapper.bottom) / 2)?.closest('button') === body }
            }),
            contentEdges: [date, sentence, ...rows.map((row) => (row.querySelector('[data-habit-row-heading] > div') ?? row.querySelector('[data-habit-row-body] > div'))!)].map((element) => element.getBoundingClientRect().left),
            insetEdges: rows.map((row) => row.getBoundingClientRect().left),
            wellInsets: rows.map((row) => {
              const body = row.querySelector('[data-habit-row-body]')!
              const well = body.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
              return well.getBoundingClientRect().left - body.getBoundingClientRect().left
            }),
            leafBody: rows[0]!.querySelector('[data-habit-row-body]')!.getBoundingClientRect().left,
            leafDisclosure: rows[0]!.querySelector('[data-habit-row-control="disclosure"]') !== null,
            overflow: document.documentElement.scrollWidth,
            rowHeights: rows.map((row) => row.getBoundingClientRect().height),
            controls: rows.flatMap((row) => Array.from(row.querySelectorAll('button')).map((button) => {
              const bounds = button.getBoundingClientRect()
              return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
            })),
          }
        })
        expect(geometry.primaryTarget.progress).toBe(true)
        if (textScale === 2) {
          expect(geometry.primaryTarget.width).toBe(geometry.primaryTarget.rowWidth)
          expect(geometry.primaryTarget.height).toBe(geometry.primaryTarget.rowHeight)
          expect(geometry.primaryTarget.radius).toBe('20px')
        }
        expect(geometry.progress.width).toBeLessThanOrEqual(geometry.progress.available)
        expect(geometry.progress.top).toBeGreaterThanOrEqual(geometry.progress.titleBottom)
        if (textScale === 2) for (const control of geometry.parentControls) {
          expect(control.top).toBeLessThanOrEqual(control.firstLineCenter)
          expect(control.bottom).toBeGreaterThan(control.firstLineCenter)
          expect(control.controlHit).toBe(true)
          expect(control.emptyBandHeight).toBeGreaterThan(0)
          expect(control.emptyBandHitsBody).toBe(true)
        }
        for (const inset of geometry.wellInsets) expect(inset).toBeGreaterThanOrEqual(8)
        expect(geometry.leafDisclosure).toBe(false)
        expect(geometry.leafBody).toBe(16)
        expect(geometry.insetEdges).toEqual([16, 16, 16])
        expect(geometry.contentEdges).toEqual([84, 84, 84, 84, 84])
        expect(geometry.overflow).toBeLessThanOrEqual(width)
        expect(geometry.rowHeights.every((height) => height >= 52)).toBe(true)
        if (textScale === 2) expect(geometry.rowHeights.every((height) => height > 68)).toBe(true)
        for (const control of geometry.controls) {
          expect(control.left).toBeGreaterThanOrEqual(16)
          expect(control.right).toBeLessThanOrEqual(width - 16)
          expect(control.width).toBeGreaterThanOrEqual(48)
          expect(control.height).toBeGreaterThanOrEqual(48)
        }
      } finally { document.documentElement.style.removeProperty('font-size'); await page.close() }
    },
  )

  it.each([320, 600].flatMap((width) => [1, 2].map((textScale) => ({ width, textScale }))))(
    'keeps the hidden skip link clear of Hoje actions at $width with $textScale text scale', async ({ width, textScale }) => {
      const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}>
        <DestinationShell onCreate={noop}><TodayDateControl {...props} isTodaySelected /></DestinationShell>
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate(async (scale) => { document.documentElement.style.fontSize = `${16 * scale}px`; await document.fonts.ready }, textScale)
        const skip = page.getByRole('link', { name: ptBr.common.skipToContent })
        const options = page.getByRole('button', { name: props.moreLabel })
        expect(await skip.getAttribute('href')).toBe('#orbit-main')
        expect(await options.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2))
        })).toBe(true)
        expect(await skip.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0)
        await page.keyboard.press('Tab')
        expect(await skip.evaluate((element) => document.activeElement === element)).toBe(true)
        const focused = await skip.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return { top: bounds.top, bottom: bounds.bottom,
            hit: element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)) }
        })
        expect(focused.top).toBe(16 * textScale)
        expect(focused.bottom).toBeLessThanOrEqual(915)
        expect(focused.hit).toBe(true)
        await page.keyboard.press('Tab')
        expect(await skip.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0)
      } finally { await page.close() }
    },
  )

  it.each([412, 1352].flatMap((width) => ['dark', 'light'].map((mode) => ({ width, mode }))))(
    'keeps the first Hoje scroller control ring complete at $width in $mode', async ({ width, mode }) => {
      const { container } = render(<NextIntlClientProvider locale="pt-BR" messages={ptBr}>
        <DestinationShell onCreate={noop}><TodayDateControl {...props} isTodaySelected /></DestinationShell>
      </NextIntlClientProvider>)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await page.evaluate((theme) => { document.documentElement.className = theme }, mode)
        const previous = page.locator('main[data-shell-scroller] button').first()
        expect(await previous.getAttribute('aria-label')).toBe(props.previousLabel)
        await previous.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        const ring = await previous.evaluate((element) => {
          const style = getComputedStyle(element)
          const extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset)
          const bounds = element.getBoundingClientRect()
          const clippedBy: string[] = []
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor)
            const clip = ancestor.getBoundingClientRect()
            if ((ancestorStyle.overflowY !== 'visible' && (bounds.top - extent < clip.top || bounds.bottom + extent > clip.bottom))
              || (ancestorStyle.overflowX !== 'visible' && (bounds.left - extent < clip.left || bounds.right + extent > clip.right))) {
              clippedBy.push(ancestor.outerHTML.split('>')[0]!)
            }
          }
          return { focused: document.activeElement === element, width: Number.parseFloat(style.outlineWidth), clippedBy }
        })
        expect(ring.focused).toBe(true)
        expect(ring.width).toBeGreaterThanOrEqual(2)
        expect(ring.clippedBy).toEqual([])
      } finally { await page.close() }
    },
  )

  it.each(['anchored', 'sheet'] as const)('keeps %s menu rows at their presentation minimum', async (presentation) => {
    const menuPresentation = presentation === 'sheet' ? { presentation } : { presentation, anchorRef: createRef<HTMLButtonElement>() }
    render(<NextIntlClientProvider locale="en" messages={en}><Menu open {...menuPresentation} title="Actions" items={[
      { id: 'edit', label: 'Edit', icon: 'edit' }, { id: 'delete', label: 'Delete', icon: 'trash', destructive: true },
    ]} /></NextIntlClientProvider>)
    await screen.findByRole('menu', { name: 'Actions' })
    const page = await browser.newPage({ viewport: { width: presentation === 'sheet' ? 412 : 1280, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${document.body.innerHTML}`)
      await page.evaluate(async () => { await document.fonts.ready })
      const heights = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
      expect(heights).toEqual(presentation === 'sheet' ? [56, 56] : [48, 48])
      const fontSizes = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((item) => Number.parseFloat(getComputedStyle(item).fontSize)))
      expect(fontSizes).toEqual([14, 14])
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      const enlargedFontSizes = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((item) => Number.parseFloat(getComputedStyle(item).fontSize)))
      expect(enlargedFontSizes).toEqual([28, 28])
      const enlarged = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
      if (presentation === 'sheet') expect(enlarged).toEqual([56, 56])
      else expect(enlarged.every((height) => height > 48)).toBe(true)
      await page.evaluate(() => { document.documentElement.style.fontSize = '48px' })
      const grown = await page.locator('[role="menuitem"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
      expect(grown.every((height) => height > (presentation === 'sheet' ? 56 : 48))).toBe(true)
    } finally { await page.close() }
  })

  const headerCases = (['en', 'pt-BR'] as const).flatMap((locale) => [
    ...[320, 400, 412].flatMap((width) => [1, 2].map((scale) => ({ locale, width, scale, labelResize: false }))),
    ...[1, 2].map((scale) => ({ locale, width: 400, scale, labelResize: true })),
  ])
  it.each(headerCases)('fits both $locale rows at $width px with $scale text scale, label resize=$labelResize', async ({ locale, width, scale, labelResize }) => {
    const messages = locale === 'en' ? en : ptBr
    const dayName = locale === 'en' ? 'Tuesday' : 'Terça-feira'
    const shortDayName = locale === 'en' ? 'Tue' : 'Ter.'
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><TodayDateControl {...props}
      dayName={dayName} shortDayName={shortDayName} todayLabel={messages.dates.today} /></NextIntlClientProvider>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      await page.evaluate(async ({ textScale, labelsOnly }) => {
        await document.fonts.ready
        if (labelsOnly) {
          const labels = document.querySelectorAll<HTMLElement>('[data-today-date-row] p')
          labels[0]!.style.fontSize = `${22 * textScale}px`
          labels[1]!.style.fontSize = `${12 * textScale}px`
          document.querySelector<HTMLElement>('[data-today-header-actions] .orbit-pill-action span')!.style.fontSize = `${14 * textScale}px`
        } else document.documentElement.style.fontSize = `${16 * textScale}px`
      }, { textScale: scale, labelsOnly: labelResize })
      const geometry = await page.evaluate(() => {
        const box = (element: Element) => {
          const rectangle = element.getBoundingClientRect()
          return { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height }
        }
        const date = document.querySelector('[data-today-date-row]')!
        const header = document.querySelector('[data-today-header-actions]')!
        const dateBlock = date.querySelector('[title]')!
        const day = dateBlock.querySelector('p')!
        const range = document.createRange()
        range.selectNodeContents(day)
        return {
          date: box(date), header: box(header), dateBlock: box(dateBlock),
          arrows: Array.from(date.querySelectorAll('button')).map(box),
          actions: Array.from(header.querySelectorAll('button')).map(box),
          dayLines: range.getClientRects().length, dayFontSize: Number.parseFloat(getComputedStyle(day).fontSize),
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(geometry.documentWidth).toBe(width)
      expect(geometry.dayLines).toBe(1)
      expect(geometry.dayFontSize).toBe(22 * scale)
      expect(geometry.arrows[1]!.left - geometry.dateBlock.right).toBeCloseTo(12)
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
      menuHeading={messages.common.options} moreLabel={messages.habits.listOptions}
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
      menuHeading={messages.common.options} moreLabel={messages.habits.listOptions}
      refreshLabel={messages.habits.refresh} onRefresh={refresh} /></NextIntlClientProvider>)
    fireEvent.click(screen.getByRole('button', { name: messages.habits.listOptions }))
    const menu = screen.getByRole('menu', { name: messages.habits.listOptions })
    expect(screen.getByRole('dialog', { name: messages.habits.listOptions })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: messages.habits.refresh }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it.each(['en', 'pt-BR'] as const)('fits the %s clear confirmation at 320 pixels and 200 percent text', async (locale) => {
    const messages = locale === 'en' ? en : ptBr
    render(<NextIntlClientProvider locale={locale} messages={messages}><ConfirmSheet open destructive
      title={messages.notifications.deleteAllAction} minimumActionHeight={48} message={messages.notifications.deleteAllConfirmDescription}
      confirmLabel={messages.notifications.deleteAllAction} onCancel={noop} onConfirm={noop} /></NextIntlClientProvider>)
    const dialog = screen.getByRole('dialog', { name: messages.notifications.deleteAllAction })
    expect(dialog.querySelectorAll('[data-slot="action-row"]')).toHaveLength(1)
    expect(dialog.querySelector<HTMLElement>('[data-slot="action-row"]')!.style.justifyContent).toBe('flex-end')
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
