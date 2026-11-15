import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { enableTestFlags, resetTestFlags } from '@orbit/shared/test-support/flag-state'
import { CommandPalette } from '@/components/command/command-palette'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { useShellStore } from '@/stores/shell-store'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-is-client', () => ({ useIsClient: () => true }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC' } }) }))
vi.mock('@/hooks/use-habit-queries', () => ({ useSearchHabits: () => {
  const habit = createMockHabit({ id: 'run', title: 'Run' })
  return { data: { habitsById: new Map([[habit.id, habit]]), childrenByParent: new Map(), topLevelHabits: [habit] }, isPending: false, isSuccess: true }
} }))
vi.mock('@/hooks/use-habit-logging', () => ({ useLogHabit: () => ({ mutate: vi.fn() }), useSkipHabit: () => ({ mutate: vi.fn() }) }))

const NavIcon = () => <svg />
const navItems = [{ id: 'hoje', label: 'Today', icon: NavIcon, onSelect: vi.fn() }] as const

describe.each([{ guided: false }, { guided: true }])('the open command palette in Chromium with orbit_guided_flows $guided', ({ guided }) => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  })
  beforeEach(() => {
    if (guided) enableTestFlags('orbit_guided_flows')
    Element.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    useShellStore.setState({ paletteOpen: true })
  })
  afterEach(() => { cleanup(); resetTestFlags(); vi.unstubAllGlobals(); useShellStore.setState({ paletteOpen: false }) })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('opens with duration 0: no running animation, and no animation or transition on the overlay, the scrim or the panel', async () => {
    render(<CommandPalette navItems={navItems} onCreateHabit={vi.fn()} />)
    await screen.findByRole('combobox', undefined, { timeout: 10_000 })
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      const theme = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
      await page.setContent(`<!DOCTYPE html><html class="dark" style="${theme}"><style>${stylesheet}</style><body>${document.body.innerHTML}</body></html>`)
      const motion = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
        const layers = [panel.parentElement!, panel.parentElement!.querySelector<HTMLElement>(':scope > button')!, panel]
        return {
          running: document.getAnimations().length,
          layers: layers.map((layer) => {
            const style = getComputedStyle(layer)
            return { animation: style.animationName, durations: style.transitionDuration.split(', ').filter((duration) => duration !== '0s') }
          }),
          mascots: document.querySelectorAll('[data-asset="orbit-mascot"], [data-orbit-state]').length,
        }
      })
      expect(motion.running, JSON.stringify(motion)).toBe(0)
      expect(motion.layers, JSON.stringify(motion)).toEqual([{ animation: 'none', durations: [] }, { animation: 'none', durations: [] }, { animation: 'none', durations: [] }])
      expect(motion.mascots).toBe(0)
    } finally { await page.close() }
  })
})
