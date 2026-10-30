import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Chip } from '@/components/ui/chip'
import { CheckRow } from '@/components/ui/check-row'
import { GoalTypeSelector } from '@/components/habits/create-goal-from-habit/goal-type-selector'
import { makeHabitDetailScopedChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import { RadioRow } from '@/components/ui/select-check'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { inspectControlAccentRings, inspectFocusedControlRings } from '@/e2e/layout/focus-indicators'
import { loadAppFonts } from './app-fonts'
import { measureSplitSegmentWords, mountMeasuredSegmentedControls } from './segmented-control-geometry'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'
import { NotificationBellDisplay } from '@/components/navigation/notification-bell'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 1 } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))

const options = [{ value: 'Mês', label: 'Mês' }, { value: 'Semana', label: 'Semana' }, { value: 'Período', label: 'Período' }, { value: 'Agenda', label: 'Agenda' }] as const

describe('selection yields to keyboard focus', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each([1, 2].flatMap((scale) => (['inline', 'corner'] as const).map((countPlacement) => ({ scale, countPlacement }))))(
    'keeps the $countPlacement bell badge paint outside clipping ancestors at scale $scale', async ({ scale, countPlacement }) => {
      const page = await browser.newPage({ reducedMotion: 'reduce' })
      try {
        await page.setContent(`<style>${stylesheet} :root { font-size:${16 * scale}px; }</style>${render(<NotificationBellDisplay count={25} countPlacement={countPlacement} onClick={vi.fn()} />).container.innerHTML}`)
        const button = page.getByRole('button')
        expect(await button.count()).toBe(1)
        expect(await button.getAttribute('aria-label')).toBe('notifications.bellWithCount')
        for (const interaction of ['rest', 'hover', 'press', 'focus'] as const) {
          if (interaction === 'hover') await button.hover()
          if (interaction === 'press') await page.mouse.down()
          if (interaction === 'focus') {
            await page.mouse.up(); await page.mouse.move(200, 200); await page.keyboard.press('Tab'); await button.focus()
            expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
          }
          const clipped = await page.locator('[data-notification-count]').evaluate((badge) => {
            const bounds = badge.getBoundingClientRect()
            const inset = Math.min(Number.parseFloat(getComputedStyle(badge).borderRadius), bounds.width / 2, bounds.height / 2) * (1 - Math.SQRT1_2)
            const corners = [bounds.left + inset, bounds.right - inset].flatMap((x) =>
              [bounds.top + inset, bounds.bottom - inset].map((y) => ({ x, y })))
            const clipped: string[] = []
            for (let ancestor = badge.parentElement; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor)
              if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
              const box = ancestor.getBoundingClientRect()
              const radius = Math.min(Number.parseFloat(style.borderRadius) || 0, box.width / 2, box.height / 2)
              if (corners.some(({ x, y }) => {
                const nearestX = Math.max(box.left + radius, Math.min(x, box.right - radius))
                const nearestY = Math.max(box.top + radius, Math.min(y, box.bottom - radius))
                return Math.hypot(x - nearestX, y - nearestY) > radius + 0.01
              })) clipped.push(ancestor.tagName)
            }
            return clipped
          })
          expect(clipped, `${interaction}: badge paint must stay visible`).toEqual([])
        }
      } finally { cleanup(); await page.close() }
    },
  )

  for (const theme of ['dark', 'light'] as const) {
    it.each([false, true].flatMap((checked) => (['none', 'active'] as const).map((forcedColors) => ({ checked, forcedColors }))))(`personal CheckRow keeps exactly one fill outline, ${theme}, checked $checked, forced colors $forcedColors`, async ({ checked, forcedColors }) => {
      const { container } = render(<CheckRow label="Habit" textMode="personal" checked={checked} onChange={vi.fn()} onOpenLabel={vi.fn()} />)
      const page = await browser.newPage({ forcedColors })
      try {
        await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style>${container.innerHTML}`)
        for (const role of ['button', 'checkbox'] as const) {
          const control = page.getByRole(role, { name: 'Habit', exact: true })
          expect(await inspectControlAccentRings(control)).toHaveLength(0)
          await page.keyboard.press('Tab')
          expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
          expect((await inspectFocusedControlRings(page))?.indicators).toEqual(['span:outline'])
          const perimeters = await control.evaluate((element) => [element, ...element.querySelectorAll('*')].flatMap((owner) => {
            const style = getComputedStyle(owner)
            return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 ? [{ tag: owner.tagName, color: style.outlineColor, offset: style.outlineOffset }] : []
          }))
          expect(perimeters).toHaveLength(1)
          expect(perimeters[0]).toMatchObject({ tag: 'SPAN', offset: '-2px' })
          expect(await inspectControlAccentRings(control)).toHaveLength(0)
        }
      } finally { cleanup(); await page.close() }
    })
    it.each(['Standard', 'Streak'] as const)(`goal type switch keeps one indicator, ${theme}, selected %s`, async (goalType) => {
      await verifyRenderedChoices(<GoalTypeSelector goalType={goalType} onTypeChange={vi.fn()} />, '[role="radio"]', theme)
    })
    it(`a selected inner DateField circle yields to its focused button, ${theme}`, async () => {
      const { container } = render(<button type="button"><span className="orbit-selection-ring orbit-selection-ring-hairline" data-selected>Today</span></button>)
      const page = await browser.newPage()
      try {
        await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style>${container.innerHTML}`)
        const control = page.locator('button')
        expect(await inspectControlAccentRings(control)).toEqual(['span:shadow'])
        await page.keyboard.press('Tab')
        expect(await control.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
        expect(await inspectControlAccentRings(control)).toEqual(['button:outline'])
        expect(await page.locator('span').evaluate((circle) => getComputedStyle(circle).boxShadow)).toBe('none')
        await page.keyboard.press('Tab')
        expect(await inspectControlAccentRings(control)).toEqual(['span:shadow'])
      } finally { cleanup(); await page.close() }
    })
    for (const selected of [false, true]) {
      for (const surface of ['segment', 'chip', 'period', 'radio'] as const) {
        it(`${surface}, selected ${selected}, ${theme}`, async () => {
          const element = surface === 'segment'
            ? <SegmentedControl label="View" options={options} value={selected ? 'Mês' : 'Semana'} onChange={() => {}} fullWidth />
            : surface === 'radio'
              ? <RadioRow label="Radio" selected={selected} onSelect={() => {}} />
              : <Chip active={selected} variant={surface === 'period' ? 'period' : 'default'}>Chip</Chip>
          const page = await browser.newPage()
          try {
            await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style>${render(element).container.innerHTML}`)
            await loadAppFonts(page)
            const control = page.locator('button').first()
            expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
            await control.hover()
            expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
            if (surface === 'segment' && !selected) return
            await page.keyboard.press('Tab')
            if (surface === 'segment') await control.focus()
            expect(await control.evaluate((button) => button.matches(':focus-visible'))).toBe(true)
            expect(await inspectControlAccentRings(control)).toHaveLength(1)
          } finally { cleanup(); await page.close() }
        })
      }
    }
  }

  async function verifyRenderedChoices(element: React.ReactNode, selector: string, theme: 'dark' | 'light') {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet}:root { ${Object.entries(resolveWebThemeVariables('orange', theme)).map(([key, value]) => `${key}:${value};`).join('')} }</style><button data-reset>Reset</button>${render(element).container.innerHTML}`)
      const choices = page.locator(selector)
      expect(await choices.count()).toBeGreaterThan(1)
      for (const control of await choices.all()) {
        await page.locator('[data-reset]').click()
        const selected = await control.getAttribute('aria-selected') === 'true' || await control.getAttribute('aria-pressed') === 'true' || await control.getAttribute('aria-checked') === 'true'
        expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
        await control.hover()
        expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
        if (await control.evaluate((element) => (element as HTMLElement).tabIndex < 0)) continue
        for (let stop = 0; stop < 20; stop += 1) {
          await page.keyboard.press('Tab')
          if (await control.evaluate((element) => element === document.activeElement)) break
        }
        expect(await control.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
        expect(await inspectControlAccentRings(control)).toHaveLength(1)
        await page.keyboard.press('Tab')
        expect(await inspectControlAccentRings(control)).toHaveLength(selected ? 1 : 0)
      }
    } finally { cleanup(); await page.close() }
  }

  for (const [locale, words] of [['en', en], ['pt-BR', ptBR]] as const) {
    for (const width of [320, 360, 384, 412]) {
      for (const fullWidth of [false, true]) {
        it(`contains label-sized segments in ${locale} at ${width}, fullWidth ${fullWidth}`, async () => {
          const choices = [{ value: 'month', label: words.calendar.view.month }, { value: 'week', label: words.calendar.view.week }, { value: 'range', label: words.calendar.view.range }, { value: 'agenda', label: words.calendar.view.agenda }] as const
          const page = await browser.newPage({ viewport: { width, height: 706 } })
          try {
            await page.setContent(`<style>${stylesheet} body { margin:0; padding:16px; }</style>${render(<SegmentedControl label="View" options={choices} value="month" onChange={() => {}} fullWidth={fullWidth} />).container.innerHTML}`)
            await loadAppFonts(page)
            const geometry = await segmentGeometry(page)
            expect(geometry).toMatchObject({ gap: '8px', radius: '12px', shadow: 'none' })
            expect(geometry.labels[0]!.left - geometry.inlineStart).toBeCloseTo(geometry.trackLeft)
            expect(geometry.labels.at(-1)!.right + geometry.inlineEnd).toBeCloseTo(geometry.trackRight)
            expect(geometry.labels.reduce((sum, label) => sum + label.segmentWidth, 0) + Number.parseFloat(geometry.gap) * (geometry.labels.length - 1) + geometry.inlineStart + geometry.inlineEnd).toBeCloseTo(geometry.trackWidth, 1)
            for (const label of geometry.labels) {
              expect(label.top - geometry.blockStart).toBeCloseTo(geometry.trackTop)
              expect(label.bottom + geometry.blockEnd).toBeCloseTo(geometry.trackBottom)
            }
            expect(new Set(geometry.labels.map((label) => label.top)).size).toBe(1)
            const remaining = geometry.labels.map((label) => label.segmentWidth - label.width)
            if (fullWidth) for (const [index, label] of geometry.labels.entries()) {
              const expected = Math.max(48 - label.width, Math.min(...remaining))
              expect(Math.abs(remaining[index]! - expected)).toBeLessThan(0.1)
            }
            for (const label of geometry.labels) {
              expect(label.fontSize).toBe('14px')
              expect(label.paddingLeft).toBe(8)
              expect(label.paddingRight).toBe(8)
              expect(label.width).toBeLessThanOrEqual(label.available)
              expect(label.lines).toBe(1)
              expect(label.height).toBeGreaterThanOrEqual(48)
              expect(label.segmentWidth).toBeGreaterThanOrEqual(48)
            }
          } finally { cleanup(); await page.close() }
        })
      }
    }
  }

  it.each([false, true])('contains large schedule labels without clipping, fullWidth %s', async (fullWidth) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 706 } })
    const words = ptBR.onboarding.flow.when
    const choices = [{ value: 'fixed', label: words.fixedMode }, { value: 'flexible', label: words.flexibleMode }, { value: 'interval', label: words.intervalMode }, { value: 'oneTime', label: words.oneTimeMode }] as const
    try {
      await page.setContent(`<style>${stylesheet} html { font-size:32px; } body { margin:0; padding:16px; }</style>${render(<SegmentedControl label="Schedule" options={choices} value="fixed" onChange={() => {}} fullWidth={fullWidth} />).container.innerHTML}`)
      await loadAppFonts(page)
      await mountMeasuredSegmentedControls(page)
      // WHY: DESIGN.md:1213 requires a Menu when whole words do not fit. https://github.com/thomasluizon/orbit-tickets/issues/1792
      expect(await page.getByRole('radiogroup').count()).toBe(0)
      const trigger = page.getByRole('button', { name: `Schedule: ${words.fixedMode}` })
      expect(await trigger.textContent()).toBe(words.fixedMode)
      const geometry = await trigger.evaluate((button) => {
        const label = button.querySelector('span')!
        const range = document.createRange(); range.selectNodeContents(label)
        const bounds = range.getBoundingClientRect()
        const style = getComputedStyle(label)
        return { width: button.getBoundingClientRect().width, scrollWidth: button.scrollWidth, fontSize: style.fontSize,
          labelWidth: label.getBoundingClientRect().width, textWidth: bounds.width, textHeight: bounds.height, labelHeight: label.getBoundingClientRect().height,
          lines: new Set([...range.getClientRects()].map((fragment) => fragment.top)).size, overflow: style.overflow, textOverflow: style.textOverflow }
      })
      expect(geometry.width).toBeLessThanOrEqual(288)
      expect(geometry.scrollWidth).toBeLessThanOrEqual(288)
      expect(geometry.fontSize).toBe('28px')
      expect(geometry.textWidth).toBeLessThanOrEqual(geometry.labelWidth)
      expect(geometry.textHeight).toBeLessThanOrEqual(geometry.labelHeight)
      expect(geometry.lines).toBe(1)
      expect(geometry.overflow).toBe('visible')
      expect(geometry.textOverflow).not.toBe('ellipsis')
      expect(await page.evaluate(measureSplitSegmentWords)).toEqual([])
    } finally { cleanup(); await page.close() }
  })
})

async function segmentGeometry(page: import('@playwright/test').Page) {
  return page.locator('[role="radiogroup"]').evaluate((track) => {
    const style = getComputedStyle(track)
    const bounds = track.getBoundingClientRect()
    return { inlineStart: Number.parseFloat(style.paddingInlineStart), inlineEnd: Number.parseFloat(style.paddingInlineEnd),
      blockStart: Number.parseFloat(style.paddingBlockStart), blockEnd: Number.parseFloat(style.paddingBlockEnd),
      gap: style.gap, radius: style.borderRadius, shadow: style.boxShadow,
      trackLeft: bounds.left, trackRight: bounds.right, trackTop: bounds.top, trackBottom: bounds.bottom,
      trackWidth: track.getBoundingClientRect().width, scrollWidth: track.scrollWidth,
      labels: [...track.querySelectorAll('button > span:not([aria-hidden="true"])')].map((label) => {
        const range = document.createRange(); range.selectNodeContents(label)
        const rect = range.getBoundingClientRect()
        const segment = label.parentElement!
        const segmentStyle = getComputedStyle(segment)
        const labelStyle = getComputedStyle(label)
        const segmentBounds = segment.getBoundingClientRect()
        return { width: rect.width, available: label.getBoundingClientRect().width, top: segmentBounds.top,
          left: segmentBounds.left, right: segmentBounds.right, bottom: segmentBounds.bottom,
          segmentWidth: segment.getBoundingClientRect().width, height: segment.getBoundingClientRect().height,
          textHeight: rect.height, lines: range.getClientRects().length, fontSize: segmentStyle.fontSize,
          whiteSpace: labelStyle.whiteSpace, overflow: labelStyle.overflow, textOverflow: labelStyle.textOverflow,
          paddingLeft: Number.parseFloat(segmentStyle.paddingLeft), paddingRight: Number.parseFloat(segmentStyle.paddingRight) }
      }) }
  })
}
