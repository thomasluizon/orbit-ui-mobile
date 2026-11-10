import { compileHabitRowStylesheet } from '@/__tests__/support/habit-row-standard-geometry'
import { render } from '@testing-library/react'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { HabitRow } from '@/components/habits/habit-row'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { afterAll, beforeAll, describe, it, vi } from 'vitest'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

describe('habit row selection spacer in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    stylesheet = await compileHabitRowStylesheet()
  })
  afterAll(async () => { vi.unstubAllGlobals(); await closeChrome(browserLaunch) }, 30_000)

  it.for([false, true])('never catches a tap on the spacer, supporting layout=%s', async (supporting, { expect }) => {
    const rootFontSize = supporting ? 32 : 16
    document.documentElement.style.fontSize = `${rootFontSize}px`
    const mounted = render(<div className="habit-panel">
      <HabitRow habit={createMockHabit({ title: 'Read' })} structuralColumn selectMode
        actions={{ onEdit: vi.fn(), onLog: vi.fn(), onToggleSelection: vi.fn(), onEnterSelectMode: vi.fn() }} />
    </div>)
    const markup = mounted.container.innerHTML
    mounted.unmount()
    document.documentElement.style.removeProperty('font-size')
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      const tokens = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${rootFontSize}px}body{margin:0;padding:16px}</style>${markup}`)
      const spacer = await page.evaluate(() => {
        const slot = document.querySelector<HTMLElement>('[data-habit-row-trailing-slot]')!
        const controls = slot.closest<HTMLElement>('[data-habit-row-controls]')!
        const box = slot.getBoundingClientRect()
        const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return {
          supportingLayout: controls.classList.contains('*:pointer-events-auto'),
          width: box.width,
          pointerEvents: getComputedStyle(slot).pointerEvents,
          tapTarget: target?.closest('[data-habit-row-trailing-slot]') ? 'spacer' : target?.closest('[data-habit-row-body]') ? 'body' : target?.closest('[data-habit-row-controls]') ? 'controls' : target?.tagName,
        }
      })
      expect(spacer).toEqual({ supportingLayout: supporting, width: 52, pointerEvents: 'none', tapTarget: supporting ? 'body' : 'controls' })
    } finally {
      await page.close()
    }
  })
})
