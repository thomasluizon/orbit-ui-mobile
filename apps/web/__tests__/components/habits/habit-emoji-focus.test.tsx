import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildHabitUnderstandingLabels } from '@orbit/shared/utils'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const placements = ['dark', 'light'].flatMap((mode) => [false, true].map((resolved) => ({
  mode: mode as 'dark' | 'light',
  resolved,
})))

function renderUnderstanding(resolved: boolean) {
  return render(
    <div className="orbit-sheet-panel">
      <HabitUnderstanding
        value="Run"
        emoji=""
        days={[]}
        dayOptions={[]}
        quantity={1}
        mode="fixed"
        sentence={resolved ? 'Every day' : null}
        consumed={[]}
        onValueChange={vi.fn()}
        onEmojiSelect={vi.fn()}
        onToggleDay={vi.fn()}
        onQuantityChange={vi.fn()}
        labels={buildHabitUnderstandingLabels((key) => key)}
      />
    </div>,
  )
}

describe('habit emoji keyboard focus in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function openPlacement(mode: 'dark' | 'light', resolved: boolean) {
    const { container } = renderUnderstanding(resolved)
    const page = await browser.newPage()
    const variables = Object.entries(resolveWebThemeVariables('orange', mode))
      .map(([property, value]) => `${property}: ${value};`).join(' ')
    await page.setContent(`<style>${stylesheet}:root {${variables}}</style>${container.innerHTML}`)
    return page
  }

  it.each(placements.flatMap((placement) => [false, true].map((hover) => ({ ...placement, hover }))))(
    'clears 3:1 in $mode, resolved $resolved, hover $hover',
    async ({ mode, resolved, hover }) => {
      const page = await openPlacement(mode, resolved)
      try {
        const well = page.getByRole('button', { name: 'habits.form.emojiOpenPicker' })
        expect(await well.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
        if (hover) {
          const restingBackground = await well.evaluate((element) => getComputedStyle(element).backgroundColor)
          await well.hover()
          await well.evaluate(async (element) => {
            await Promise.all(element.getAnimations().map((animation) => animation.finished))
          })
          expect(await well.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(restingBackground)
        }
        const painted = await well.evaluate((element) => {
          const style = getComputedStyle(element)
          const layers: string[] = []
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            layers.unshift(getComputedStyle(ancestor).backgroundColor)
            if (ancestor.classList.contains('orbit-sheet-panel')) break
          }
          return {
            focused: element.matches(':focus-visible'),
            shadow: style.boxShadow,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineOffset: style.outlineOffset,
            outlineColor: style.outlineColor,
            foreground: getComputedStyle(document.documentElement).getPropertyValue('--fg-1').trim(),
            layers,
            background: style.backgroundColor,
          }
        })
        expect(painted.focused).toBe(true)
        expect(painted.outlineStyle).toBe('solid')
        expect(painted.outlineWidth).toBe('2px')
        expect(painted.outlineOffset).toBe('-2px')
        expect(painted.shadow).toBe('none')
        expect(contrastOnSurface(painted.outlineColor, [painted.foreground])).toBe(1)
        const ring = painted.outlineColor
        const surroundingContrast = contrastOnSurface(ring, painted.layers)
        const wellContrast = contrastOnSurface(ring, [...painted.layers, painted.background])
        process.stdout.write(`${mode}, resolved ${resolved}, hover ${hover}: well ${wellContrast.toFixed(6)}:1; surround ${surroundingContrast.toFixed(6)}:1\n`)
        expect(wellContrast, 'focus ring against the painted well').toBeGreaterThanOrEqual(3)
        expect(surroundingContrast, 'focus ring against the surrounding surface').toBeGreaterThanOrEqual(3)
      } finally {
        await page.close()
      }
    },
  )

  it.each(placements)('keeps a system focus outline in $mode, resolved $resolved', async ({ mode, resolved }) => {
    const page = await openPlacement(mode, resolved)
    try {
      await page.emulateMedia({ forcedColors: 'active' })
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      const well = page.getByRole('button', { name: 'habits.form.emojiOpenPicker' })
      await well.hover()
      const indicator = await well.evaluate((element) => {
        const style = getComputedStyle(element)
        const systemColor = document.createElement('span')
        systemColor.style.color = 'CanvasText'
        element.append(systemColor)
        const canvasText = getComputedStyle(systemColor).color
        systemColor.remove()
        return {
          focused: element.matches(':focus-visible'),
          shadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          outlineColor: style.outlineColor,
          forcedColorAdjust: style.forcedColorAdjust,
          canvasText,
        }
      })
      expect(indicator).toEqual({
        focused: true,
        shadow: 'none',
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineOffset: '-2px',
        outlineColor: indicator.canvasText,
        forcedColorAdjust: 'auto',
        canvasText: indicator.canvasText,
      })
    } finally {
      await page.close()
    }
  })
})
