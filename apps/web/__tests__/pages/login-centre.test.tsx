import { act, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLoginScreenFixture } from '@orbit/shared/__tests__/auth-screen-fixtures'
import en from '@orbit/shared/i18n/en.json'
import { LoginContent } from '@/app/(auth)/login/login-content'

const SE = { height: 667, safeTop: 20 }
const VIEWPORT = SE.height - SE.safeTop
const STEP_GAP = 24
const CHECK_HEIGHTS = { none: 0, loading: 28, challenge: 65 } as const
type CheckState = keyof typeof CHECK_HEIGHTS

const mocks = vi.hoisted(() => ({ flow: {} as Record<string, unknown> }))
vi.mock('@/app/(auth)/login/use-login-flow', () => ({ useLoginFlow: () => mocks.flow }))
vi.mock('motion/react-m', async () => {
  const actual = await import('motion/react')
  return actual.m
})
vi.mock('motion/react', async () => {
  const React = await import('react')
  return { useReducedMotion: () => true,
    domMin: {},
    LazyMotion: ({ children }: { children: React.ReactNode }) => children,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    m: { div: ({ children }: { children: React.ReactNode }) => React.createElement('div', {}, children) } }
})

interface TurnstileOptions {
  callback: (token: string) => void
  'before-interactive-callback': () => void
  'after-interactive-callback': () => void
}

const geometry = { check: 'none' as CheckState, column: 0, challenge: null as HTMLElement | null }
const observers = new Set<() => void>()

function box(height: number) {
  return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) } as DOMRect
}

function checkSpace() {
  return CHECK_HEIGHTS[geometry.check] > 0 ? CHECK_HEIGHTS[geometry.check] + STEP_GAP : 0
}

function stubLayout() {
  vi.stubGlobal('ResizeObserver', class {
    private readonly callback: () => void
    constructor(callback: () => void) { this.callback = callback }
    observe() { observers.add(this.callback) }
    unobserve() {}
    disconnect() { observers.delete(this.callback) }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === geometry.challenge) return box(geometry.check === 'challenge' ? CHECK_HEIGHTS.challenge : 0)
    if (this === geometry.challenge?.parentElement) return box(CHECK_HEIGHTS[geometry.check])
    if (this.matches('[data-field-surface]')) return box(geometry.column + checkSpace())
    return box(0)
  })
}

function settleLayout() {
  for (let pass = 0; pass < 3; pass += 1) act(() => { for (const callback of [...observers]) callback() })
}

/** The page frame centres the column box. An inset on the column or on a parent moves the content down from that centre. */
function gaps(main: HTMLElement) {
  let inset = 0
  for (let element = main.querySelector<HTMLElement>('[data-field-surface]'); element && element !== main; element = element.parentElement) {
    inset += Number.parseFloat(element.style.marginTop || '0') + Number.parseFloat(element.style.paddingTop || '0')
  }
  const content = geometry.column + checkSpace()
  const top = Math.max(0, (VIEWPORT - inset - content) / 2) + inset
  return { top, bottom: VIEWPORT - top - content }
}

async function renderSignIn(step: 'email' | 'code', column: number) {
  stubLayout()
  geometry.check = 'none'
  geometry.column = column
  const renderWidget = vi.fn((..._args: unknown[]) => 'steady-widget')
  ;(window as Window & { turnstile?: unknown }).turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() }
  mocks.flow = { ...createLoginScreenFixture(step, 'en'), t: createTranslator({ locale: 'en', messages: en }),
    turnstileSiteKey: 'site-key', turnstileResetKey: 0, onTurnstileToken: vi.fn(), setEmail: vi.fn(), sendCode: vi.fn(),
    verifyCode: vi.fn(), resendCode: vi.fn(), backToEmail: vi.fn(), onCodeChange: vi.fn(), continueAccount: vi.fn() }
  const { container } = render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <style>{`form { row-gap: ${STEP_GAP}px }`}</style>
    <main style={{ minHeight: `${SE.height}px`, paddingTop: `${SE.safeTop}px`, paddingBottom: '0px' }}><LoginContent /></main>
  </NextIntlClientProvider>)
  await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
  geometry.challenge = renderWidget.mock.calls[0]![0] as HTMLElement
  const options = renderWidget.mock.calls[0]![1] as TurnstileOptions
  const changes: Record<CheckState, () => void> = {
    none: () => options.callback('steady-token'),
    loading: () => options['after-interactive-callback'](),
    challenge: () => options['before-interactive-callback'](),
  }
  return { main: container.querySelector('main')!, changes }
}

afterEach(() => {
  delete (window as Window & { turnstile?: unknown }).turnstile
  observers.clear()
  geometry.challenge = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('web sign-in column at 375 x 667', () => {
  it.each([
    { step: 'email', column: 486 },
    { step: 'code', column: 486 },
    { step: 'email', column: 540 },
    { step: 'code', column: 540 },
  ] as const)('centres the $step column of $column while the check appears, changes and leaves', async ({ step, column }) => {
    const { main, changes } = await renderSignIn(step, column)
    for (const check of ['none', 'loading', 'challenge', 'loading', 'none'] as const) {
      act(() => changes[check]())
      geometry.check = check
      settleLayout()
      const { top, bottom } = gaps(main)
      expect({ check, top, bottom }).toEqual({ check, top: (VIEWPORT - column - checkSpace()) / 2, bottom: (VIEWPORT - column - checkSpace()) / 2 })
    }
  })
})
