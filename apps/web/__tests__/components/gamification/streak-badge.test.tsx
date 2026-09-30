import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
}))

vi.mock('@/lib/plural', () => ({
  plural: (text: string) => text,
}))

import { StreakBadge } from '@/components/gamification/streak-badge'

describe('StreakBadge', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('stays visible at streak 0 and still routes to Progresso', () => {
    render(<StreakBadge streak={0} />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(pushMock).toHaveBeenCalledWith('/progress')
  })

  it('renders badge as a button for positive streak', () => {
    render(<StreakBadge streak={3} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('displays streak count', () => {
    render(<StreakBadge streak={5} />)
    expect(document.body.textContent).toContain('5')
  })

  it('navigates to Progresso when clicked', () => {
    render(<StreakBadge streak={5} />)
    fireEvent.click(screen.getByRole('button'))
    expect(pushMock).toHaveBeenCalledWith('/progress')
  })

  it('shows frozen icon when isFrozen is true', () => {
    const { container } = render(<StreakBadge streak={5} isFrozen={true} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 12 14')
  })

  it('shows the flame emoji instead of the frozen icon by default', () => {
    const { container } = render(<StreakBadge streak={5} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toContain('🔥')
  })

  it('has accessible aria-label', () => {
    render(<StreakBadge streak={10} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label')
  })
})


describe('StreakBadge hover paint in Chromium', () => {
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

  it.each(['dark', 'light'] as const)('preserves the opaque fill and clears the hover and text floors in %s', async (mode) => {
    const { container } = render(<StreakBadge streak={0} />)
    const variables = resolveWebThemeVariables('orange', mode)
    const declarations = Object.entries(variables).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${stylesheet} :root{${declarations}} body{padding:48px;background:var(--bg)}</style>${container.innerHTML}`)
      const button = page.locator('button')
      const resting = await button.evaluate((element) => getComputedStyle(element).backgroundColor)
      await button.hover()
      await button.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)))
      const paint = await button.evaluate((element) => ({
        base: getComputedStyle(element).backgroundColor,
        layer: getComputedStyle(element, '::after').backgroundColor,
        text: getComputedStyle(element.querySelector('span:last-child')!).color,
        pointerEvents: getComputedStyle(element, '::after').pointerEvents,
      }))
      expect(paint.base).toBe(resting)
      expect(contrastOnSurface(resting, [paint.base, paint.layer])).toBeGreaterThanOrEqual(1.25)
      expect(contrastOnSurface(paint.text, [paint.base, paint.layer])).toBeGreaterThanOrEqual(4.5)
      expect(paint.pointerEvents).toBe('none')
    } finally {
      await page.close()
    }
  })
})
