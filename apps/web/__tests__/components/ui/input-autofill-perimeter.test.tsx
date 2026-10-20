import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import type { ReactNode } from 'react'
import en from '@orbit/shared/i18n/en.json'
import { LoginContent } from '@/app/(auth)/login/login-content'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { Input } from '@/components/ui/input'
import { FlowShell } from '@/components/shell/flow-shell'
import { RowList } from '@/components/ui/row-list'
import { Sheet } from '@/components/ui/sheet'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: 'en', messages: en }), useLocale: () => 'en' }
})
vi.mock('@/components/shell/shell-wide', () => ({ ShellWide: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))

const surfaces = ['canvas', 'card', 'sheet', 'marked card', 'sheet in card'] as const
const states = ['rest', 'focus', 'error', 'focused error'] as const

async function renderSurface(surface: (typeof surfaces)[number], state: (typeof states)[number], multiline = false, trailing = false) {
  const props = { label: 'Email', name: 'email', autoComplete: 'email', value: 'field@example.com', onChange: () => {}, error: state.includes('error') ? 'Enter a complete email' : undefined } as const
  const input = multiline ? <Input {...props} multiline rows={3} /> : <Input {...props} kind="email" trailing={trailing ? <span aria-hidden="true">@</span> : undefined} />
  const card = <RowList style={{ padding: 24 }}>{input}</RowList>
  const content = surface === 'card' ? card : surface === 'marked card' ? <div data-field-surface="card" className="bg-[var(--bg-card)] p-6">{input}</div>
    : surface === 'sheet in card' ? <RowList><Sheet title="Edit name">{input}</Sheet></RowList>
      : surface === 'sheet' ? <Sheet title="Edit name">{input}</Sheet> : input
  const mounted = await act(async () => render(content))
  const markup = surface.includes('sheet') ? screen.getByRole('dialog').outerHTML : mounted.container.innerHTML
  await act(async () => { mounted.unmount() })
  return markup
}

async function nativeAutofill(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument', { depth: 0 })
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input, textarea' })
  return {
    set: async (enabled: boolean) => {
      await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: enabled ? ['autofill'] : [] })
      expect(await page.locator('input, textarea').evaluate((control) => control.matches(':autofill'))).toBe(enabled)
    },
    close: () => session.detach(),
  }
}

async function readPaint(page: Page) {
  return page.locator('input, textarea').evaluate((control) => {
    const perimeter = control.closest('[data-focus-perimeter]')!
    function shadows(value: string) {
      return [...value.matchAll(/(rgba?\([^)]+\)) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px( inset)?/g)]
        .map((match) => ({ color: match[1]!, x: Number(match[2]), y: Number(match[3]), blur: Number(match[4]), spread: Number(match[5]), inset: Boolean(match[6]) }))
        .filter((shadow) => shadow.spread > 0 && !/rgba\([^)]*, 0\)$/.test(shadow.color))
    }
    const ancestors: Element[] = []
    for (let parent = perimeter.parentElement; parent; parent = parent.parentElement) ancestors.unshift(parent)
    const outerLayers = ancestors.map((element) => getComputedStyle(element).backgroundColor)
    const style = getComputedStyle(control)
    const bounds = control.getBoundingClientRect()
    const fills = shadows(style.boxShadow).filter((shadow) => shadow.inset && shadow.x === 0 && shadow.y === 0 && shadow.blur === 0 && shadow.spread >= Math.max(bounds.width, bounds.height) / 2)
    const innerLayers = [...outerLayers, getComputedStyle(perimeter).backgroundColor, style.backgroundColor, ...[...fills].reverse().map((shadow) => shadow.color)]
    const overlay = getComputedStyle(perimeter, '::after')
    const rings = shadows(overlay.boxShadow)
    const strokeCount = [perimeter, control].reduce((count, element) => {
      const elementStyle = getComputedStyle(element)
      const elementBounds = element.getBoundingClientRect()
      return count + Number(elementStyle.outlineStyle !== 'none' && Number.parseFloat(elementStyle.outlineWidth) > 0)
        + Number(elementStyle.borderTopStyle !== 'none' && Number.parseFloat(elementStyle.borderTopWidth) > 0)
        + shadows(elementStyle.boxShadow).filter((shadow) => shadow.spread > 0 && shadow.spread < Math.min(elementBounds.width, elementBounds.height) / 2).length
    }, rings.length)
    return { outerLayers, innerLayers, rings, strokeCount, background: style.backgroundColor, text: style.webkitTextFillColor, color: style.color, caret: style.caretColor, fillCount: fills.length, shadow: style.boxShadow, focused: control.matches(':focus-visible'), pointerEvents: overlay.pointerEvents, bounds: { width: bounds.width, height: bounds.height }, border: getComputedStyle(perimeter).borderTopColor }
  })
}

function expectSameFill(typed: Awaited<ReturnType<typeof readPaint>>, autofilled: Awaited<ReturnType<typeof readPaint>>) {
  for (const color of ['rgb(0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(196, 83, 15)']) {
    expect(contrastOnSurface(color, autofilled.innerLayers)).toBeCloseTo(contrastOnSurface(color, typed.innerLayers), 2)
  }
}

describe.each(['dark', 'light'] as const)('Input autofill perimeter in Chromium, %s', (mode) => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => {
    browserLaunch = launch
    browser = await launch
  })

  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}: ${value};`).join(' ')
    stylesheet = `${compiled.css} :root { ${variables} color-scheme: ${mode}; } body { background: var(--bg); padding: 24px; } [data-input-root] { width: 280px; }`
  })

  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it.each(surfaces.flatMap((surface) => states.map((state) => ({ surface, state }))))('keeps one perimeter with the typed fill on $surface at $state', async ({ surface, state }) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${await renderSurface(surface, state)}`)
      if (state.includes('focus')) await page.locator('input').focus()
      const typed = await readPaint(page)
      expect(typed.shadow).toBe('none')
      const autofill = await nativeAutofill(page)
      try {
        await autofill.set(true)
        const filled = await readPaint(page)
        expect(filled.background).toBe(mode === 'dark' ? 'rgba(70, 90, 126, 0.4)' : 'rgb(232, 240, 254)')
        expect(filled.strokeCount).toBe(1)
        expect(filled.pointerEvents).toBe('none')
        expect(filled.focused).toBe(state.includes('focus'))
        expect(filled.rings[0]!.spread).toBe(state === 'rest' ? 1 : 2)
        if (state !== 'rest') {
          const ring = filled.rings[0]!.color
          expect(contrastOnSurface(ring, filled.innerLayers), 'inner edge contrast').toBeGreaterThanOrEqual(3)
          expect(contrastOnSurface(ring, filled.outerLayers), 'outer edge contrast').toBeGreaterThanOrEqual(3)
        }
        expect(filled.fillCount).toBeGreaterThanOrEqual(2)
        expectSameFill(typed, filled)
        expect(contrastOnSurface(filled.text, filled.innerLayers)).toBeGreaterThanOrEqual(4.5)
        expect(filled.caret).toBe(typed.caret)
        expect(filled.bounds).toEqual(typed.bounds)
        await autofill.set(false)
        expect((await readPaint(page)).shadow).toBe('none')
      } finally {
        await autofill.close()
      }
    } finally {
      await page.close()
    }
  })

  it.each(['sign-in', 'card', 'detail', 'document', 'onboarding'] as const)(
    'matches the typed fill in the owning %s composition across its responsive boundary', async (owner) => {
      const content = owner === 'sign-in' ? <LoginContent />
        : <FlowShell mode={owner}><Input label="Message" value="Typed value" onChange={() => {}} /></FlowShell>
      const mounted = await act(async () => render(content))
      const markup = mounted.container.innerHTML
      await act(async () => { mounted.unmount() })
      const page = await browser.newPage()
      try {
        await page.setContent(`<!doctype html><style>${stylesheet}</style>${markup}`)
        for (const width of [412, 1280, 412]) {
          await page.setViewportSize({ width, height: 915 })
          await page.locator('input').focus()
          const typed = await readPaint(page)
          expect(typed.shadow).toBe('none')
          const autofill = await nativeAutofill(page)
          try {
            await autofill.set(true)
            const filled = await readPaint(page)
            expectSameFill(typed, filled)
            expect(filled.strokeCount).toBe(1)
            expect(filled.bounds).toEqual(typed.bounds)
            expect(contrastOnSurface(filled.rings[0]!.color, filled.innerLayers)).toBeGreaterThanOrEqual(3)
            expect(contrastOnSurface(filled.rings[0]!.color, filled.outerLayers)).toBeGreaterThanOrEqual(3)
          } finally {
            await autofill.set(false)
            await autofill.close()
          }
        }
      } finally {
        await page.close()
      }
    },
  )

  it.each([false, true])('keeps the typed fill for multiline %s with a trailing accessory on a single line', async (multiline) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${await renderSurface('sheet', 'focus', multiline, true)}`)
      await page.locator('input, textarea').focus()
      const typed = await readPaint(page)
      const autofill = await nativeAutofill(page)
      try {
        await autofill.set(true)
        const filled = await readPaint(page)
        expectSameFill(typed, filled)
        expect(filled.strokeCount).toBe(1)
        expect(filled.bounds).toEqual(typed.bounds)
        expect(contrastOnSurface(filled.rings[0]!.color, filled.innerLayers)).toBeGreaterThanOrEqual(3)
      } finally {
        await autofill.close()
      }
    } finally {
      await page.close()
    }
  })

  it.each([false, true])('preserves native forced colors with multiline %s', async (multiline) => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${await renderSurface('sheet', 'rest', multiline)}`)
      await page.emulateMedia({ forcedColors: 'active' })
      await page.locator('input, textarea').focus()
      const autofill = await nativeAutofill(page)
      try {
        await autofill.set(true)
        const paint = await readPaint(page)
        expect(paint.shadow).toBe('none')
        expect(paint.rings).toEqual([])
        expect(paint.strokeCount).toBe(1)
        expect(paint.focused).toBe(true)
        expect(paint.text).toBe(paint.color)
        expect(paint.caret).toBe(paint.color)
        expect(contrastOnSurface(paint.text, paint.innerLayers)).toBeGreaterThanOrEqual(4.5)
      } finally {
        await autofill.close()
      }
    } finally {
      await page.close()
    }
  })
})
