import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { weekStartDay: 0 } }) }))

describe('habit row immediate padding', () => {
  let browser: Browser
  let browserLaunch: BrowserLaunch | undefined
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each((['light', 'dark'] as const).flatMap((mode) =>
    (['reduce', 'no-preference'] as const).map((motion) => ({ mode, motion })),
  ))('applies real row padding immediately in $mode with $motion', async ({ mode, motion }) => {
    const { container, unmount } = render(<>
      <HabitRow habit={createMockHabit({ id: 'padding-body', title: 'Padding body', description: 'Read two pages.' })}
        hasChildren childProgress={{ done: 0, total: 3 }} structuralColumn meta={['0 of 3']} />
      <HabitRow habit={createMockHabit({ id: 'padding-selection', title: 'Padding selection', description: 'Read two pages.' })}
        hasChildren childProgress={{ done: 0, total: 3 }} structuralColumn selectMode meta={['0 of 3']} />
    </>)
    const page = await browser.newPage({ viewport: { width: 1352, height: 1200 }, reducedMotion: motion })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><html class="${mode}" style="${variables};font-size:16px"><style>${stylesheet}</style><body style="background:var(--bg)"><div style="width:704px">${container.innerHTML}</div></body></html>`)
      const trace = await page.evaluate(async () => {
        const bodies = Array.from(document.querySelectorAll<HTMLElement>('[data-habit-row-body]'))
        const visual = document.querySelector<HTMLElement>('[data-personal-text-content]')!
        const targets = [...bodies, visual]
        const snapshot = () => targets.map((element, index) => {
          const style = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          return {
            target: index < bodies.length ? `body-${index}` : 'personal-text-content',
            tag: element.tagName, className: element.className, inlineStyle: element.getAttribute('style'),
            inlinePaddingBlock: element.style.paddingBlock,
            computedPaddingStart: style.paddingBlockStart, computedPaddingEnd: style.paddingBlockEnd,
            display: style.display, alignItems: style.alignItems,
            transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration,
            bounds: { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height },
            transitions: element.getAnimations()
              .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
              .map((animation) => ({ property: animation.transitionProperty,
                duration: animation.effect!.getTiming().duration, easing: animation.effect!.getTiming().easing })),
          }
        })
        const parsed = snapshot()
        await new Promise<void>((done) => requestAnimationFrame(() => done()))
        const before = snapshot()
        for (const element of targets) element.style.paddingBlock = '0px'
        const immediate = snapshot()
        await new Promise<void>((done) => requestAnimationFrame(() => done()))
        const afterFrame = snapshot()
        return { targetCount: targets.length, bodyCount: bodies.length,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          rootFont: getComputedStyle(document.documentElement).fontSize,
          parsed, before, immediate, afterFrame }
      })
      expect(trace.bodyCount).toBe(2)
      expect(trace.targetCount).toBe(3)
      expect(trace.reducedMotion).toBe(motion === 'reduce')
      expect(trace.rootFont).toBe('16px')
      expect(trace.before.map((item) => item.computedPaddingStart)).toEqual(['8px', '8px', '8px'])
      expect(trace.before.map((item) => item.computedPaddingEnd)).toEqual(['8px', '8px', '8px'])
      expect(trace.immediate.map((item) => item.inlinePaddingBlock)).toEqual(['0px', '0px', '0px'])
      expect(trace.immediate.map((item) => item.computedPaddingStart), JSON.stringify({ mode, motion, trace })).toEqual(['0px', '0px', '0px'])
      expect(trace.immediate.map((item) => item.computedPaddingEnd)).toEqual(['0px', '0px', '0px'])
    } finally {
      await page.close()
      unmount()
    }
  })
})
