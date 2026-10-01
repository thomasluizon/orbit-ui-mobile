import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { PromptQuietAction } from '@/components/ui/prompt-quiet-action'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'

let browser: Browser
let browserLaunch: BrowserLaunch | undefined
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

it.each(['dark', 'light'] as const)('keeps a 44px quiet target, legible text and reversible press feedback in %s', async (mode) => {
  const onClick = vi.fn()
  const { container, rerender } = render(<PromptQuietAction onClick={onClick}>Later</PromptQuietAction>)
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  expect(onClick).toHaveBeenCalledOnce()
  rerender(<PromptQuietAction disabled onClick={onClick}>Later</PromptQuietAction>)
  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  expect(onClick).toHaveBeenCalledOnce()
  rerender(<PromptQuietAction onClick={onClick}>Later</PromptQuietAction>)

  const variables = resolveWebThemeVariables('orange', mode)
  const declarations = Object.entries(variables).map(([name, value]) => `${name}: ${value};`).join(' ')
  const page = await browser.newPage({ viewport: { width: 320, height: 640 } })
  try {
    await page.setContent(`<style>${stylesheet}\n:root { ${declarations} } body { padding: 24px; background: var(--bg-elev); }</style>${container.innerHTML}`)
    await loadAppFonts(page)
    const button = page.getByRole('button', { name: 'Later' })
    const measure = () => button.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.finish()
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { height: bounds.height, width: bounds.width, color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, scale: style.scale, opacity: style.opacity, background: style.backgroundColor }
    })
    const rest = await measure()
    expect(rest.height).toBe(44)
    expect(rest.width).toBeGreaterThanOrEqual(44)
    expect(rest.fontSize).toBe('14px')
    expect(rest.fontWeight).toBe('500')
    expect(contrastOnSurface(rest.color, [variables['--bg-elev']!])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(rest.color, [variables['--fg-2']!])).toBe(1)

    await button.hover()
    const hover = await measure()
    expect(contrastOnSurface(variables['--bg-elev']!, [variables['--bg-elev']!, hover.background])).toBeGreaterThanOrEqual(1.25)
    expect(contrastOnSurface(hover.color, [variables['--bg-elev']!, hover.background])).toBeGreaterThanOrEqual(4.5)
    await page.mouse.down()
    const pressed = await measure()
    expect(contrastOnSurface(pressed.color, [variables['--bg-elev']!, pressed.background])).toBeGreaterThanOrEqual(4.5)
    expect(contrastOnSurface(variables['--bg-elev']!, [variables['--bg-elev']!, pressed.background])).toBeGreaterThanOrEqual(1.25)
    expect(pressed.scale).toBe('0.96')
    expect(pressed.color).toBe(rest.color)
    expect(pressed.opacity).toBe('1')
    await page.mouse.up()
    expect((await measure()).scale).toBe(rest.scale)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.mouse.down()
    const reducedPress = await measure()
    expect(reducedPress.scale).toBe(rest.scale)
    expect(reducedPress.background).toBe(pressed.background)
    await page.mouse.up()
  } finally {
    await page.close()
  }
})
