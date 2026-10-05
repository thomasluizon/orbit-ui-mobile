import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { Composer } from '@/components/shell/composer'
import { AppBar } from '@/components/ui/app-bar'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { DESTINATION_ICONS, SHELL_DESTINATION_IDS } from '@orbit/shared/utils'
import { ShellWide } from '@/components/shell/shell-wide'
import { FlowShell } from '@/components/shell/flow-shell'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { NotFoundContent } from '@/components/ui/not-found-content'
import { Toast } from '@/components/ui/toast'
import { CelebrationPanel } from '@/components/gamification/celebration-panel'
import { useUIStore } from '@/stores/ui-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const windows = ([[360, 740], [412, 915], [480, 800], [600, 900], [840, 900], [1100, 900]] as const)
  .flatMap(([width, height]) => [{ width, height }, { width: height, height: width }])

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

describe('Foldable shell geometry', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each([
    ...[320, 412, 600].flatMap((width) => [0, 24].map((top) => ({ width, top, bottom: top ? 34 : 0, left: 0, right: 0 }))),
    { width: 412, top: 0, bottom: 21, left: 44, right: 44 },
    { width: 844, top: 0, bottom: 21, left: 44, right: 44 },
    { width: 844, top: 0, bottom: 0, left: 0, right: 0 },
  ])(
    'keeps compact shell chrome inside insets at $width with top $top', async ({ width, top, bottom, left, right }) => {
      const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
        header={<button type="button" style={{ minHeight: 48 }}>Header</button>}
        composer={<button type="button" style={{ minHeight: 56 }}>Composer</button>}
        tabBar={<nav style={{ minHeight: 80 }}><button type="button" style={{ minHeight: 48 }}>Today</button></nav>}
        notice={<Toast kind="neutral" message="Habit saved" />}
        fab={<button type="button" style={{ width: 48, height: 48 }}>Create</button>}
        scrollToTop={<button type="button" style={{ minHeight: 48 }}>Top</button>}>
        <div style={{ height: 1600 }}>Habits</div>
      </ShellWide>)
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const session = await page.context().newCDPSession(page)
        await session.send('Emulation.setSafeAreaInsetsOverride', { insets: { top, bottom, left, right } })
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const geometry = await page.evaluate(() => {
          const shell = document.querySelector('[data-shell="wide"]')!.getBoundingClientRect()
          const controls = [...document.querySelectorAll('[data-shell-header] button, [data-shell-pinned-slot] button, [data-shell-tab-bar] button, [data-shell-fab] button, [data-shell-scroll-to-top] button, [data-shell-notice] [data-kind]')]
            .map((element) => ({ label: element.textContent, top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right }))
          return { top: shell.top, bottom: shell.bottom, controls }
        })
        expect(geometry.top).toBe(0)
        expect(geometry.bottom).toBe(915)
        expect(geometry.controls).toHaveLength(6)
        expect(geometry.controls[0]!.top).toBe(top)
        for (const control of geometry.controls) {
          expect(control.left, control.label).toBeGreaterThanOrEqual(left)
          expect(control.right, control.label).toBeLessThanOrEqual(width - right)
          expect(control.top, control.label).toBeGreaterThanOrEqual(top)
          expect(control.bottom, control.label).toBeLessThanOrEqual(915 - bottom)
        }
      } finally { await page.close() }
    },
  )

  it.each([1100, 1440].flatMap((width) => [en, ptBR].flatMap((words) => [1, 2].map((textScale) => ({ width, words, textScale })))))
    ('grows the sidebar account target around two lines at $width and text scale $textScale', async ({ width, words, textScale }) => {
      const name = 'W'.repeat(60)
      const email = `${'W'.repeat(48)}@example.com`
      const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel={words.nav.mainNavigation} account={name} accountEmail={email} />)
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      try {
        const largeText = textScale === 2 ? '[data-shell-account-name] { font-size: 28px; } [data-shell-account-email] { font-size: 24px; }' : ''
        await page.setContent(`<style>${stylesheet}\n${largeText}</style>${container.innerHTML}`)
        const account = page.getByRole('link', { name: `${name} ${email}` })
        expect(await account.getAttribute('href')).toBe('/profile')
        const geometry = await account.evaluate((element) => {
          const control = element.getBoundingClientRect()
          const fields = [...element.querySelectorAll<HTMLElement>('[data-shell-account-name], [data-shell-account-email]')].map((text) => {
            const style = getComputedStyle(text)
            const bounds = text.getBoundingClientRect()
            return { lines: bounds.height / Number.parseFloat(style.lineHeight), clamp: style.webkitLineClamp, fontSize: Number.parseFloat(style.fontSize),
              clipped: text.scrollHeight > text.clientHeight, width: bounds.width,
              availableWidth: text.parentElement!.clientWidth, top: bounds.top, bottom: bounds.bottom }
          })
          return { fields, height: control.height,
            topPadding: fields[0]!.top - control.top, bottomPadding: control.bottom - fields[1]!.bottom,
            overflow: document.documentElement.scrollWidth > innerWidth }
        })
        expect(geometry.fields).toHaveLength(2)
        expect(geometry.fields.map((field) => field.fontSize)).toEqual([14 * textScale, 12 * textScale])
        for (const field of geometry.fields) {
          expect(field.lines).toBeCloseTo(2, 0)
          expect(field.clamp).toBe('2')
          expect(field.clipped).toBe(true)
          expect(field.width).toBeCloseTo(field.availableWidth, 0)
        }
        expect(geometry.fields[1]!.top).toBeGreaterThan(geometry.fields[0]!.bottom)
        expect(geometry.height).toBeGreaterThanOrEqual(48)
        expect(geometry.topPadding).toBeGreaterThanOrEqual(4)
        expect(geometry.bottomPadding).toBeGreaterThanOrEqual(4)
        expect(geometry.overflow).toBe(false)
      } finally { await page.close() }
    })

  it.each([360, 740, 1100].flatMap((width) => [false, true].map((navigationEnabled) => ({ width, navigationEnabled }))))(
    'keeps the full Create target revealable at $width with a 120px height budget and nav=$navigationEnabled', async ({ width, navigationEnabled }) => {
    const action = <div className="p-4"><HabitCreateActions presentation="screen" pending={false} empty={false}
      subHabit={false} online formId="create-habit" onCancel={vi.fn()} /></div>
    const flow = navigationEnabled ? { items: [], activeId: '', navLabel: en.nav.mainNavigation, composer: action } : { nav: false as const, action }
    const { container } = render(<ShellWide {...flow}
      header={<AppBar title={en.habits.createHabit} onBack={vi.fn()} backLabel={en.common.back} />}
    >
      <div style={{ height: 1600 }}>Habit form</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 120 } })
    try {
      await page.setContent(`<style>${stylesheet}\n[data-shell-column] { padding-top: 24px; } :root { --safe-bottom: 0px; }</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const pinned = document.querySelector<HTMLElement>('[data-shell-pinned-slot]')!
        const button = pinned.querySelector<HTMLButtonElement>('button')!
        button.scrollIntoView({ block: 'center', behavior: 'instant' })
        const target = button.getBoundingClientRect()
        const viewport = pinned.getBoundingClientRect()
        return { targetHeight: target.height, viewportHeight: viewport.height, top: target.top,
          bottom: target.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom,
          enabled: !button.disabled, hit: document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2)?.closest('button') === button }
      })
      expect(geometry.targetHeight).toBeGreaterThanOrEqual(50)
      expect(geometry.viewportHeight).toBeGreaterThanOrEqual(geometry.targetHeight)
      expect(geometry.viewportBottom).toBeLessThanOrEqual(120)
      expect(geometry.top).toBeGreaterThanOrEqual(geometry.viewportTop)
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportBottom)
      expect(geometry.enabled).toBe(true)
      expect(geometry.hit).toBe(true)
    } finally { await page.close() }
  })

  it.each([840, 1100].flatMap((width) => (['card', 'onboarding'] as const).map((mode) => ({ width, mode }))))(
    'preserves full-height flow centering at $width in $mode mode', async ({ width, mode }) => {
    const { container } = render(<FlowShell mode={mode} action={<button type="button" className="h-[50px]">Continue</button>}>
      <div style={{ height: 100 }}>Flow content</div>
    </FlowShell>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const scrollerElement = document.querySelector('[data-shell-scroller]')!
        const scroller = scrollerElement.getBoundingClientRect()
        const flow = document.querySelector<HTMLElement>('[data-flow-mode]')!
        const content = flow.firstElementChild!.getBoundingClientRect()
        const box = flow.getBoundingClientRect()
        const style = getComputedStyle(flow)
        return { height: box.height, scrollerHeight: scroller.height,
          padding: parseFloat(getComputedStyle(scrollerElement).paddingBottom),
          leading: content.top - box.top - parseFloat(style.paddingTop),
          trailing: box.bottom - content.bottom - parseFloat(style.paddingBottom) }
      })
      expect(geometry.padding).toBe(width < 1024 ? 96 : 32)
      expect(geometry.height).toBeCloseTo(geometry.scrollerHeight - (width < 1024 ? 96 : 32), 0)
      expect(geometry.leading).toBeGreaterThan(0)
      expect(geometry.leading).toBeCloseTo(geometry.trailing, 0)
    } finally { await page.close() }
  })

  it.each([412, 1280].flatMap((width) => [100, 1600].map((contentHeight) => ({ width, contentHeight }))))(
    'owns onboarding clearance at $width with $contentHeight px of content', async ({ width, contentHeight }) => {
    const { container } = render(<FlowShell mode="onboarding"
      action={<button type="button" className="h-[50px]">Continue</button>}>
      <div data-onboarding-content="" style={{ height: contentHeight }}>Onboarding content</div>
    </FlowShell>)
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        const content = document.querySelector('[data-onboarding-content]')!.getBoundingClientRect()
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        return { padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          clearance: bottom.top - content.bottom, bottom: bottom.bottom,
          documentWidth: document.documentElement.scrollWidth }
      })
      const clearance = width < 1024 ? 96 : 32
      expect(geometry.padding).toBe(clearance)
      expect(geometry.clearance).toBeGreaterThanOrEqual(clearance)
      expect(geometry.bottom).toBeLessThanOrEqual(900)
      expect(geometry.documentWidth).toBe(width)
    } finally { await page.close() }
  })

  it.each([320, 412, 500, 740, 1024, 1352])('aligns feedback and not-found content without reserving composer space at %ipx', async (width) => {
    useUIStore.setState({ activeCelebration: null, queuedCelebrations: [] })
    useUIStore.getState().enqueueCelebration('all-done', { count: 1 })
    const { container } = render(<ShellWide items={[]} activeId="" navLabel="Navigation"
      notice={<><CelebrationPanel /><Toast kind="neutral" message="Notification removed" /></>}
      tabBar={<nav style={{ height: 64 }}>Tabs</nav>}>
      <NotFoundContent inShell />
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.evaluate(() => {
        const column = document.querySelector('[data-shell-column]')!
        const rectangle = column.getBoundingClientRect()
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        const edges = (element: Element) => {
          const box = element.getBoundingClientRect()
          return { left: box.left, right: box.right }
        }
        return {
          scrollContent: { left: rectangle.left + 16, right: rectangle.left + scroller.clientWidth - 16 },
          composerCount: document.querySelectorAll('[data-composer-root]').length,
          pinnedCount: document.querySelectorAll('[data-shell-pinned-slot]').length,
          padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          clearance: bottom.top - last.bottom,
          toast: edges(document.querySelector('[data-shell-notice] [data-kind]')!),
          celebration: edges(document.querySelector('[data-celebration-panel]')!),
          title: edges(document.querySelector('[data-state="not-found"] h1')!),
          documentWidth: document.documentElement.scrollWidth,
        }
      })
      expect(bounds.composerCount).toBe(0)
      expect(bounds.pinnedCount).toBe(0)
      expect(bounds.padding).toBe(32)
      expect(bounds.clearance).toBeGreaterThanOrEqual(31)
      expect.soft(bounds.toast).toEqual(bounds.scrollContent)
      expect.soft(bounds.celebration).toEqual(bounds.scrollContent)
      expect.soft(bounds.title).toEqual(bounds.scrollContent)
      expect(bounds.documentWidth).toBe(width)
    } finally { await page.close() }
  })

  it.each([360, 320])('budgets the real header, composer and tab bar inside a %ipx tall window', async (height) => {
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel={en.nav.mainNavigation}
      header={<AppBar title={en.nav.today} onBack={vi.fn()} backLabel={en.common.back} />}
      composer={<Composer state="idle" value="" words={en.shell.composer}
        suggestions={toComposerSuggestions(['today', 'calendar', 'progress'].map((id) => ({ id, label: en.nav[id as 'today' | 'calendar' | 'progress'], onSelect: vi.fn() })))}
        onChangeValue={vi.fn()} onSend={vi.fn()} onVoice={vi.fn()} voiceWords={en.shell.composer.voice}
        onAttachFile={vi.fn()} onAttachImage={vi.fn()}
        attachWords={{ file: en.chat.attachFile, image: en.chat.attachImage, trayLabel: en.chat.attachFile, remove: (name) => name }}
        onOpenConversation={vi.fn()} conversationLabel={en.todayAstra.openConversation} />}
      tabBar={<BottomTabBar label={en.nav.mainNavigation} activeId="hoje" onSelect={vi.fn()}
        items={SHELL_DESTINATION_IDS.map((id) => ({ id, label: en.nav[DESTINATION_ICONS[id].commandId], icon: ({ active }) => <DestinationIcon destination={id} active={active} /> }))} />}>
      <div style={{ height: 1600 }}>Long habit detail</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width: 740, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        return { bottom: box('[data-shell-bottom]').bottom, headerTop: box('[data-shell-header]').top,
          tabsHeight: box('[data-shell-tab-bar]').height, scrollerHeight: scroller.clientHeight,
          clearance: box('[data-shell-bottom]').top - scroller.lastElementChild!.getBoundingClientRect().bottom }
      })
      expect(geometry.bottom).toBeLessThanOrEqual(height)
      expect(geometry.headerTop).toBe(0)
      expect(geometry.tabsHeight).toBe(80)
      expect(geometry.scrollerHeight).toBeGreaterThanOrEqual(48)
      expect(geometry.clearance).toBeGreaterThanOrEqual(95)
      for (const control of await page.locator('[data-shell-pinned-slot] button:not([disabled]), [data-shell-pinned-slot] textarea').all()) {
        await control.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
        const box = (await control.boundingBox())!
        const pinned = (await page.locator('[data-shell-pinned-slot]').boundingBox())!
        expect(box.y).toBeGreaterThanOrEqual(pinned.y)
        expect(box.y + box.height).toBeLessThanOrEqual(pinned.y + pinned.height)
      }
    } finally { await page.close() }
  })

  it.each(windows)('centres content and chrome at $width by $height', async ({ width, height }) => {
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      header={<h1>Screen</h1>} composer={<button type="button">Composer</button>}
      tabBar={<nav>Tabs</nav>} fab={<button type="button">Create</button>}>
      <div style={{ height: 1600 }}>Long screen</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        const column = scroller.parentElement!
        const available = column.parentElement!.getBoundingClientRect()
        const content = column.getBoundingClientRect()
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        const pinned = document.querySelector('[data-shell-pinned-slot]')!.getBoundingClientRect()
        return {
          availableWidth: available.width, width: content.width,
          leftGap: content.left - available.left, rightGap: available.right - content.right,
          documentWidth: document.documentElement.scrollWidth,
          scrollerWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth,
          clearance: bottom.top - last.bottom, pinnedLeft: pinned.left, columnLeft: content.left,
          pinnedWidth: pinned.width, bottom: bottom.bottom,
        }
      })
      expect(bounds.width).toBeLessThanOrEqual(740)
      if (width < 1024) expect(bounds.width).toBe(Math.min(width, 740))
      expect(Math.abs(bounds.leftGap - bounds.rightGap)).toBeLessThanOrEqual(1)
      expect(bounds.documentWidth).toBe(width)
      expect(bounds.scrollerWidth).toBe(bounds.clientWidth)
      expect(bounds.pinnedLeft).toBe(bounds.columnLeft)
      expect(bounds.pinnedWidth).toBe(bounds.width)
      expect(bounds.clearance).toBeGreaterThanOrEqual(width < 1024 ? 95 : 31)
      expect(bounds.bottom).toBeLessThanOrEqual(height)
    } finally { await page.close() }
  })

  it.each([412, 1023, 1024, 1352])('clears navigation without reserving composer space at %ipx', async (width) => {
    const { container } = render(<ShellWide items={[]} activeId="calendario" navLabel="Navigation"
      tabBar={<nav style={{ height: 64 }}>Tabs</nav>}>
      <div style={{ height: 1600 }}>Long destination</div>
    </ShellWide>)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const geometry = await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
        scroller.scrollTop = scroller.scrollHeight
        const bottom = document.querySelector('[data-shell-bottom]')!.getBoundingClientRect()
        const last = scroller.lastElementChild!.getBoundingClientRect()
        return {
          padding: parseFloat(getComputedStyle(scroller).paddingBottom),
          clearance: bottom.top - last.bottom,
          bottomHeight: bottom.height,
          bottom: bottom.bottom,
          pinnedCount: document.querySelectorAll('[data-shell-pinned-slot]').length,
        }
      })
      expect(geometry.pinnedCount).toBe(0)
      expect(geometry.padding).toBe(32)
      expect(geometry.clearance).toBeCloseTo(32, 0)
      expect(geometry.bottomHeight).toBe(width < 1024 ? 64 : 0)
      expect(geometry.bottom).toBe(915)
    } finally { await page.close() }
  })

  it.each(windows.filter(({ width }) => width < 1024))('aligns the compact conversation at $width by $height', async ({ width, height }) => {
    const { container } = render(<ShellWide items={[]} activeId="hoje" navLabel="Navigation"
      conversation={<button type="button">Close conversation</button>} conversationLabel="Conversation" />)
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
      const bounds = await page.locator('[data-shell-conversation="overlay"]').evaluate((element) => {
        const rectangle = element.getBoundingClientRect()
        return { width: rectangle.width, left: rectangle.left, right: rectangle.right, height: rectangle.height }
      })
      expect(bounds.width).toBe(Math.min(width, 740))
      expect(bounds.left).toBe((width - bounds.width) / 2)
      expect(bounds.right).toBe(width - bounds.left)
      expect(bounds.height).toBe(height)
    } finally { await page.close() }
  })

})
