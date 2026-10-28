import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWebMotionVariables } from '@/lib/theme-dom'
import { goBackDuringSheetExit } from '@/test-support/sheet-exit'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from './chromium'
import { bundleGeometry } from './profile-settings-browser'

describe('sheet exit animation observation in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let script: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    script = bundleGeometry(`
      import React, { useLayoutEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { flushSync } from 'react-dom';
      import { NextIntlClientProvider } from 'next-intl';
      import en from '../../packages/shared/src/i18n/en.json';
      import { DiscardChangesSheet } from './components/ui/discard-changes-sheet';
      import { useDismissGuard } from './hooks/use-dismiss-guard';
      import { useHabitCreateNavigationGuard } from './hooks/use-habit-create-navigation-guard';
      import { goBackDuringSheetExit } from './test-support/sheet-exit';
      function Fixture() {
        const guard = useDismissGuard({ isDirty: true, onDismiss() {} });
        useHabitCreateNavigationGuard({ active: true, dirty: true, leaving: false, onNavigate: guard.requestDismiss, onReturn() {} });
        useLayoutEffect(() => {
          Object.assign(window, { openConfirmation: () => flushSync(guard.requestDismiss), goBackDuringSheetExit });
        }, [guard]);
        return <DiscardChangesSheet open={guard.showDiscardDialog} onKeepEditing={guard.cancelDismiss}
          onKeepEditingStart={guard.beginCancelDismiss} onDiscard={guard.confirmDismiss} />;
      }
      createRoot(document.getElementById('root')).render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><Fixture /></NextIntlClientProvider>);
    `, {
      'next/navigation': "export const useRouter = () => ({ push() {} }); export const unstable_isUnrecognizedActionError = () => false;",
    })
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function mount(width = 600) {
    const page = await browser.newPage({ reducedMotion: 'no-preference', viewport: { width, height: 915 } })
    onTestFinished(async () => { await page.close() })
    const variables = Object.entries(resolveWebMotionVariables()).map(([key, value]) => `${key}:${value}`).join(';')
    await page.setContent(`<style>${stylesheet} :root { ${variables} }</style><div id="root"></div>`)
    await page.addScriptTag({ content: script })
    await page.waitForFunction(() => Reflect.has(window, 'openConfirmation'))
    return page
  }

  for (const width of [412, 600]) {
    it.each(['before first paint', 'during entrance', 'after entrance'])(`observes the mounted discard sheet exit %s at ${width}px`, async (phase) => {
      const page = await mount(width)
      const duringExit = await page.evaluate(async (phase) => {
        Reflect.get(window, 'openConfirmation')()
        const panel = document.querySelector('[role="dialog"]')!
        if (!panel.classList.contains('orbit-sheet-panel')) throw new Error('Expected the sheet popup to own the dialog role')
        if (phase !== 'before first paint') {
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
          const entrance = panel.getAnimations()
          if (!entrance.length) throw new Error('Expected a real sheet entrance transition')
          if (phase === 'after entrance') await Promise.all(entrance.map((animation) => animation.finished))
        }
        return Reflect.get(window, 'goBackDuringSheetExit')(panel.querySelector('footer button')) as ReturnType<typeof goBackDuringSheetExit>
      }, phase)
      expect(duringExit.mountedDuringBack).toBe(true)
      expect(duringExit.animationCount).toBeGreaterThan(0)
      const keepEditing = page.getByRole('button', { name: 'Keep editing', exact: true })
      await expect.poll(() => keepEditing.isEnabled()).toBe(true)
      await expect.poll(() => keepEditing.evaluate((button) => document.activeElement === button)).toBe(true)
      await keepEditing.click()
      await expect.poll(() => page.getByRole('dialog').count()).toBe(0)
    })
  }

  it.each([false, true])('observes a real exit before browser Back with delayed styles=%s', async (delayed) => {
    const page = await mount()
    await page.evaluate(() => Reflect.get(window, 'openConfirmation')())
    const markup = await page.locator('.orbit-sheet-portal').evaluate((portal) => portal.outerHTML)
    await page.setContent(`<style>${stylesheet}
      .orbit-sheet-panel[data-wait-for-frame][data-ending-style] { opacity: 1; transform: translateY(0); }
    </style>${markup}`)
    await page.evaluate(async ({ variables, delayed }) => {
      for (const [property, value] of Object.entries(variables)) document.documentElement.style.setProperty(property, value)
      const panel = document.querySelector('[role="dialog"]')!
      panel.getAnimations().forEach((animation) => animation.finish())
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      history.replaceState({ orbitHabitCreateSentinel: true }, '', '#guard')
      history.pushState({ orbitHabitCreateSentinel: true }, '', '#draft')
      panel.querySelector('footer button')!.addEventListener('click', () => {
        if (delayed) panel.setAttribute('data-wait-for-frame', '')
        panel.setAttribute('data-ending-style', '')
        if (delayed) requestAnimationFrame(() => requestAnimationFrame(() => panel.removeAttribute('data-wait-for-frame')))
      }, { once: true })
    }, { variables: resolveWebMotionVariables(), delayed })

    const duringExit = await page.getByRole('button', { name: 'Keep editing', exact: true }).evaluate(goBackDuringSheetExit)
    expect(duringExit.mountedDuringBack).toBe(true)
    expect(duringExit.animationCount).toBeGreaterThan(0)
    expect(await page.evaluate(() => location.hash)).toBe('#guard')
  })

  it.each(['zero exit duration', 'zero enter and exit duration', 'missing exit attribute'])('rejects %s without navigating Back', async (failure) => {
    const page = await mount()
    await expect(page.evaluate(async (failure) => {
      document.body.dataset.popstates = '0'
      window.addEventListener('popstate', () => { document.body.dataset.popstates = String(Number(document.body.dataset.popstates) + 1) })
      if (failure !== 'missing exit attribute') document.documentElement.style.setProperty('--motion-sheet-exit', '0ms')
      if (failure === 'zero enter and exit duration') document.documentElement.style.setProperty('--motion-sheet-enter', '0ms')
      Reflect.get(window, 'openConfirmation')()
      const panel = document.querySelector('[role="dialog"]')!
      const button = panel.querySelector('footer button')!
      if (failure === 'zero exit duration') {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        if (!panel.getAnimations().length) throw new Error('Expected a real sheet entrance transition')
      }
      if (failure === 'missing exit attribute') button.addEventListener('click', (event) => event.stopPropagation(), { once: true })
      return Reflect.get(window, 'goBackDuringSheetExit')(button) as ReturnType<typeof goBackDuringSheetExit>
    }, failure)).rejects.toThrow('Expected a real sheet exit transition')
    expect(await page.evaluate(() => Reflect.get(Object(history.state), 'orbitHabitCreateSentinel'))).toBe(true)
    if (failure === 'missing exit attribute') {
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
      await expect.poll(() => page.getByRole('dialog').count()).toBe(0)
    }
    expect(await page.locator('body').getAttribute('data-popstates')).toBe('0')
  })
})
