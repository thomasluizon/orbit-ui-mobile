import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render } from '@testing-library/react'
import { Command } from 'cmdk'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Page } from '@playwright/test'
import type { ReactNode } from 'react'
import en from '@orbit/shared/i18n/en.json'
import { Input } from '@/components/ui/input'
import { TimeField } from '@/components/ui/time-field'
import { FieldWell } from '@/components/goals/field-well'
import { CommandSearchField } from '@/components/command/command-menu-chrome'
import { Composer } from '@/components/shell/composer'
import { HabitUnderstanding } from '@/components/habits/habit-form-fields/habit-understanding'
import { OtpInput } from '@/components/ui/otp-input'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('next-intl', async (importActual) => {
  const actual = await importActual<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: 'en', messages: en }), useLocale: () => 'en' }
})
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: true } }) }))

const surfaces = ['input', 'multiline', 'time', 'goal', 'command', 'composer', 'habit', 'code'] as const
type Surface = (typeof surfaces)[number]
const noop = () => {}

async function markup(surface: Surface, focused = false, disabled = false, error?: string) {
  const contents: Record<Surface, ReactNode> = {
    input: <Input label="Email" value="" onChange={noop} disabled={disabled} error={error} kind="email" autoComplete="email" />,
    multiline: <Input label="Message" value="" onChange={noop} multiline disabled={disabled} error={error} />,
    time: <TimeField label="Time" value="14:30" onChange={noop} disabled={disabled} error={error} />,
    goal: <FieldWell label="Goal" id="goal" type="text" value="" onChange={noop} />,
    command: <Command><CommandSearchField search="" setSearch={noop} activePageLabel={null} onBack={noop} /></Command>,
    composer: <Composer {...(disabled ? { state: 'sending' as const } : { state: 'idle' as const })} value="" onChangeValue={noop} onSend={noop} suggestions={[]} words={{ placeholder: 'Message', send: 'Send', suggestionsLabel: 'Suggestions' }} />,
    code: <OtpInput label="Code" value="" onChange={noop} autoFocus={false} disabled={disabled} error={error} />,
    habit: <HabitUnderstanding value="" emoji="" days={[]} dayOptions={[]} quantity={1} mode="fixed" sentence={null} consumed={[]} onValueChange={noop} onEmojiSelect={noop} onToggleDay={noop} onQuantityChange={noop} labels={{ field: 'Habit', placeholder: 'Habit', understood: 'Understood', understoodAstra: 'Understood', unresolved: 'Choose a schedule', days: 'Days', less: 'Less', more: 'More', count: String, repeat: String, repeatLess: 'Less', repeatMore: 'More', proposed: 'Proposed' }} />,
  }
  return renderedMarkup(contents[surface], focused, disabled)
}

async function renderedMarkup(content: ReactNode, focused = false, disabled = false) {
  const mounted = await act(async () => render(content))
  const control = mounted.container.querySelector('input, textarea')
  if (control) await act(async () => { if (focused) fireEvent.focus(control); else fireEvent.blur(control) })
  if (disabled && control) control.setAttribute('disabled', '')
  const result = mounted.container.innerHTML
  await act(async () => { mounted.unmount() })
  return result
}

async function paint(page: Page) {
  return page.locator('[data-focus-perimeter], [data-otp-cell]').evaluateAll((perimeters) => perimeters.map((perimeter) => {
    const style = getComputedStyle(perimeter)
    const overlay = getComputedStyle(perimeter, '::after')
    const isOverlay = perimeter.closest('[data-input-root]') !== null
    const ringStyle = isOverlay ? overlay : style
    const ring = ringStyle.boxShadow
    const rings = [...ring.matchAll(/(rgba?\([^)]+\)) 0px 0px 0px ([\d.]+)px inset/g)]
      .filter((match) => Number(match[2]) > 0 && !/rgba\([^)]*, 0\)$/.test(match[1]!))
      .map((match) => ({ color: match[1], width: Number(match[2]) }))
    const probe = document.createElement('span')
    probe.style.transition = 'none'
    document.body.append(probe)
    function token(name: string) {
      probe.style.color = `var(${name})`
      return getComputedStyle(probe).color
    }
    const colors = { rest: token('--border-control'), hover: token('--hairline-strong'), focus: token('--primary'), error: token('--status-bad') }
    probe.remove()
    const extraStroke = Number(style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0)
      + Number(style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0)
      + Number(isOverlay && style.boxShadow !== 'none')
    return { rings, extraStroke, colors, duration: ringStyle.transitionDuration, property: ringStyle.transitionProperty, easing: ringStyle.transitionTimingFunction, fill: style.backgroundColor }
  }))
}

async function forceAutofill(page: Page) {
  const session = await page.context().newCDPSession(page)
  await session.send('DOM.enable')
  await session.send('CSS.enable')
  const { root } = await session.send('DOM.getDocument', { depth: 0 })
  const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input, textarea' })
  await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] })
  expect(await page.locator('input, textarea').evaluate((control) => control.matches(':autofill'))).toBe(true)
  return session
}

describe.each(['dark', 'light'] as const)('field hover in Chromium, %s', (mode) => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string

  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    const source = resolve(process.cwd(), 'app/globals.css')
    const compiled = await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })
    const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}: ${value};`).join(' ')
    stylesheet = `${compiled.css} :root { ${variables} color-scheme: ${mode}; } body { background: var(--bg); padding: 24px; }`
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  async function open(surface: Surface, focused = false, disabled = false, error?: string, hasTouch = false) {
    const page = await browser.newPage({ hasTouch })
    await page.setContent(`<!doctype html><style>${stylesheet}</style>${await markup(surface, focused, disabled, error)}`)
    return page
  }

  it.each(surfaces)('moves only the %s ring one step and returns at the control duration', async (surface) => {
    const page = await open(surface)
    try {
      const rest = await paint(page)
      await page.locator('input, textarea').first().hover()
      const transitions = await page.locator('[data-focus-perimeter], [data-otp-cell]').evaluateAll((perimeters) => perimeters.flatMap((perimeter) => perimeter.getAnimations({ subtree: true }).map((animation) => animation instanceof CSSTransition ? animation.transitionProperty : 'animation')))
      expect(transitions).toContain('box-shadow')
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.hover, width: 1 }])
      for (const perimeter of await paint(page)) {
        expect(perimeter.rings).toEqual([{ color: perimeter.colors.hover, width: 1 }])
        expect(perimeter.extraStroke).toBe(0)
        expect(perimeter.fill).toBe(rest[0]!.fill)
        expect(perimeter.duration).toBe('0.24s')
        expect(perimeter.property).toBe('box-shadow')
        expect(perimeter.easing).toBe('cubic-bezier(0.2, 0, 0, 1)')
      }
      await page.mouse.move(0, 0)
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.rest, width: 1 }])
      expect((await paint(page))[0]!.duration).toBe('0.24s')
    } finally { await page.close() }
  })

  it.each(surfaces)('keeps focus and disabled %s perimeters out of hover', async (surface) => {
    for (const disabled of [false, true]) {
      const page = await open(surface, !disabled, disabled)
      try {
        if (!disabled) await page.locator('input, textarea').first().focus()
        const before = await paint(page)
        if (!disabled) expect(before[0]!.rings).toEqual([{ color: before[0]!.colors.focus, width: 2 }])
        await page.locator('input, textarea').first().hover()
        await expect.poll(() => paint(page)).toEqual(before)
        expect(before.every((perimeter) => perimeter.extraStroke === 0)).toBe(true)
      } finally { await page.close() }
    }
  })

  it.each(surfaces)('does not latch %s hover on a touch pointer', async (surface) => {
    const page = await open(surface, false, false, undefined, true)
    try {
      expect(await page.evaluate(() => ({ hover: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches }))).toEqual({ hover: true, coarse: true })
      const rest = await paint(page)
      await page.locator('input, textarea').first().hover()
      expect(await paint(page)).toEqual(rest)
    } finally { await page.close() }
  })

  it.each(['input', 'multiline'] as const)('leaves the autofilled %s overlay ring alone, including focus', async (surface) => {
    const page = await open(surface)
    try {
      const session = await forceAutofill(page)
      const rest = await paint(page)
      await page.locator('input, textarea').hover()
      expect(await paint(page)).toEqual(rest)
      await page.locator('input, textarea').focus()
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.focus, width: 2 }])
      expect((await paint(page))[0]!.extraStroke).toBe(0)
      await session.detach()
    } finally { await page.close() }
  })

  it.each(surfaces)('withdraws %s hover immediately when the control becomes disabled', async (surface) => {
    const page = await open(surface)
    try {
      const rest = await paint(page)
      await page.locator('input, textarea').first().hover()
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.hover, width: 1 }])
      await page.locator('input, textarea').first().evaluate((control) => { (control as HTMLInputElement | HTMLTextAreaElement).disabled = true })
      for (const perimeter of await paint(page)) {
        expect(perimeter.rings).toEqual([{ color: perimeter.colors.rest, width: 1 }])
        expect(perimeter.extraStroke).toBe(0)
      }
    } finally { await page.close() }
  })

  it.each(['input', 'multiline'] as const)('withdraws the %s overlay hover immediately when autofill starts', async (surface) => {
    const page = await open(surface)
    try {
      const rest = await paint(page)
      await page.locator('input, textarea').hover()
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.hover, width: 1 }])
      const session = await forceAutofill(page)
      expect((await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.rest, width: 1 }])
      await session.detach()
    } finally { await page.close() }
  })

  it.each(['input', 'multiline', 'time', 'code'] as const)('preserves the %s validation ring during hover', async (surface) => {
    const page = await open(surface, false, false, 'Enter a valid value')
    try {
      await page.locator('input, textarea').evaluate((control) => (control as HTMLElement).blur())
      const rest = await paint(page)
      expect(rest[0]!.rings).toEqual([{ color: rest[0]!.colors.error, width: 2 }])
      await page.locator('input, textarea').hover()
      expect(await paint(page)).toEqual(rest)
    } finally { await page.close() }
  })

  it('keeps the active code cell focused while the other five retain their error rings', async () => {
    const page = await open('code', true, false, 'Enter a valid code')
    try {
      await page.locator('input').focus()
      await page.locator('input').hover()
      const perimeters = await paint(page)
      expect(perimeters[0]!.rings).toEqual([{ color: perimeters[0]!.colors.focus, width: 2 }])
      expect(perimeters.slice(1).map((perimeter) => perimeter.rings)).toEqual(Array.from({ length: 5 }, () => [{ color: perimeters[0]!.colors.error, width: 2 }]))
    } finally { await page.close() }
  })

  it.each(['recording', 'transcribing'] as const)('does not hover a composer showing %s instead of an editable field', async (state) => {
    const mode = state === 'recording' ? { state: 'recording' as const } : { state: 'transcribing' as const }
    const content = <Composer {...mode} value="" onChangeValue={noop} onSend={noop} suggestions={[]} words={{ placeholder: 'Message', send: 'Send', suggestionsLabel: 'Suggestions' }} onVoice={noop} voiceWords={{ start: 'Record', stop: 'Stop', recording: 'Recording', transcribing: 'Transcribing' }} />
    const page = await browser.newPage()
    try {
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${await renderedMarkup(content)}`)
      expect(await page.locator('textarea').count()).toBe(0)
      const rest = await paint(page)
      await page.locator('[data-composer-input-row]').hover({ position: { x: 20, y: 20 } })
      expect(await paint(page)).toEqual(rest)
    } finally { await page.close() }
  })

  it('suppresses the field hover while a trailing button owns the pointer', async () => {
    const page = await browser.newPage()
    try {
      const content = <Input label="Message" value="" onChange={noop} trailing={<button type="button">Details</button>} />
      await page.setContent(`<!doctype html><style>${stylesheet}</style>${await renderedMarkup(content)}`)
      const rest = await paint(page)
      await page.locator('button').hover()
      expect(await paint(page)).toEqual(rest)
    } finally { await page.close() }
  })

  it.each(surfaces)('keeps static %s hover feedback with reduced motion', async (surface) => {
    const page = await open(surface)
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const rest = await paint(page)
      await page.locator('input, textarea').hover()
      await expect.poll(async () => (await paint(page))[0]!.rings).toEqual([{ color: rest[0]!.colors.hover, width: 1 }])
      for (const perimeter of await paint(page)) {
        expect(perimeter.rings).toEqual([{ color: perimeter.colors.hover, width: 1 }])
        expect(Number.parseFloat(perimeter.duration)).toBeLessThanOrEqual(0.001)
      }
    } finally { await page.close() }
  })
})
