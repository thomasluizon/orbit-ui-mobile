import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

  it.each(['before first paint', 'after entrance'])('observes the mounted discard sheet exit %s', async (phase) => {
    const page = await browser.newPage({ reducedMotion: 'no-preference', viewport: { width: 600, height: 915 } })
    try {
      const variables = Object.entries(resolveWebMotionVariables()).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<style>${stylesheet} :root { ${variables} }</style><div id="root"></div>`)
      await page.addScriptTag({ content: script })
      await page.waitForFunction(() => Reflect.has(window, 'openConfirmation'))
      const duringExit = await page.evaluate(async (phase) => {
        Reflect.get(window, 'openConfirmation')()
        const panel = document.querySelector('[role="dialog"]')!
        if (!panel.classList.contains('orbit-sheet-panel')) throw new Error('Expected the sheet popup to own the dialog role')
        if (phase === 'after entrance') {
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
          await Promise.all(panel.getAnimations().map((animation) => animation.finished))
        }
        return Reflect.get(window, 'goBackDuringSheetExit')(panel.querySelector('footer button')) as ReturnType<typeof goBackDuringSheetExit>
      }, phase)
      expect(duringExit.mountedDuringBack).toBe(true)
      expect(duringExit.animationCount).toBeGreaterThan(0)
      await expect.poll(() => page.getByRole('button', { name: 'Keep editing', exact: true }).isEnabled()).toBe(true)
    } finally {
      await page.close()
    }
  })

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
