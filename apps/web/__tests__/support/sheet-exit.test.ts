import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWebMotionVariables } from '@/lib/theme-dom'
import { goBackDuringSheetExit } from '@/test-support/sheet-exit'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'

describe('sheet exit animation observation in Chromium', () => {
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

  it.each([false, true])('observes a real exit before browser Back with delayed styles=%s', async (delayed) => {
    const page = await browser.newPage({ reducedMotion: 'no-preference' })
    try {
      await page.setContent(`<style>${stylesheet}
        .orbit-sheet-panel[data-wait-for-frame][data-ending-style] { opacity: 1; transform: translateY(0); }
      </style><div role="dialog" class="orbit-sheet-panel"><button>Keep editing</button></div>`)
      await page.evaluate(async ({ variables, delayed }) => {
        for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
        const panel = document.querySelector('[role="dialog"]')!
        panel.getAnimations().forEach((animation) => animation.finish())
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        history.replaceState({ orbitHabitCreateSentinel: true }, '', '#guard')
        history.pushState({ orbitHabitCreateSentinel: true }, '', '#draft')
        document.querySelector('button')!.addEventListener('click', () => {
          if (delayed) panel.setAttribute('data-wait-for-frame', '')
          panel.setAttribute('data-ending-style', '')
          if (delayed) requestAnimationFrame(() => requestAnimationFrame(() => panel.removeAttribute('data-wait-for-frame')))
        }, { once: true })
      }, { variables: resolveWebMotionVariables(), delayed })

      const duringExit = await page.getByRole('button').evaluate(goBackDuringSheetExit)
      expect(duringExit.mountedDuringBack).toBe(true)
      expect(duringExit.animationCount).toBeGreaterThan(0)
      expect(await page.evaluate(() => location.hash)).toBe('#guard')
    } finally {
      await page.close()
    }
  })

  it.each(['zero duration', 'missing exit attribute'])('rejects %s without navigating Back', async (failure) => {
    const page = await browser.newPage({ reducedMotion: 'no-preference' })
    try {
      await page.setContent(`<style>${stylesheet}</style>
        <div role="dialog" class="orbit-sheet-panel"><button>Keep editing</button></div>`)
      await page.evaluate(async ({ variables, failure }) => {
        for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
        if (failure === 'zero duration') {
          document.documentElement.style.setProperty('--motion-sheet-enter', '0ms')
          document.documentElement.style.setProperty('--motion-sheet-exit', '0ms')
        }
        const panel = document.querySelector('[role="dialog"]')!
        panel.getAnimations().forEach((animation) => animation.finish())
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        history.replaceState({ orbitHabitCreateSentinel: true }, '', '#guard')
        history.pushState({ orbitHabitCreateSentinel: true }, '', '#draft')
        if (failure !== 'missing exit attribute') {
          document.querySelector('button')!.addEventListener('click', () => panel.setAttribute('data-ending-style', ''), { once: true })
        }
      }, { variables: resolveWebMotionVariables(), failure })

      await expect(page.getByRole('button').evaluate(goBackDuringSheetExit)).rejects.toThrow('Expected a real sheet exit transition')
      expect(await page.evaluate(() => location.hash)).toBe('#draft')
      await page.evaluate(async () => {
        document.querySelector('[role="dialog"]')!.setAttribute('data-ending-style', '')
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      })
      expect(await page.evaluate(() => location.hash)).toBe('#draft')
    } finally {
      await page.close()
    }
  })
})
