import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createLocaleDateFormatters } from '@orbit/shared/hooks'
import { GuidedStepUp, type GuidedStepUpState } from '@/app/step-up/guided-step-up'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { FLOW_LOCALES, FLOW_WIDTHS, centreOffset, compileAppStylesheet, measureFlowMarkup, stubViewportMedia } from '@/__tests__/support/flow-layout'

vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children }: { children: React.ReactNode }) => <div className="flex min-h-0 flex-1 flex-col">{children}</div> }))
vi.mock('@/components/ui/update-available-banner', () => ({ UpdateAvailableBanner: () => null }))

const noop = () => {}
const challenge = { kind: 'challenge', checking: false, code: '', codeFocusRequest: undefined, cooldownSeconds: 42, email: 'ada.lovelace@example.com', expired: false, onCancel: noop, onCodeChange: noop, onConfirm: noop, onResend: noop, requestError: null, requesting: false } as const
const states: Record<string, GuidedStepUpState> = {
  'code question': challenge,
  'code question with the resend action': { ...challenge, cooldownSeconds: 0 },
  'expired code': { ...challenge, expired: true },
  'attempts ran out': { kind: 'exhausted', backLabel: 'Voltar', lockSeconds: 754, onBack: noop },
}
/** The closed state with the dates the screen shows: the numeric date in the title and the long date in the Pro note. */
function closes(locale: string): GuidedStepUpState {
  return { kind: 'success', scheduledAt: '2026-09-24T03:00:00Z', deletionDate: createLocaleDateFormatters(locale).displayDate('2026-09-24T03:00:00Z'), showProNotice: true, onSignOut: noop }
}
const cases = FLOW_WIDTHS.flatMap((width) => FLOW_LOCALES.flatMap((locale) => [...Object.keys(states), 'account closes'].map((state) => ({ width, locale, state }))))

describe('the guided step-up layout in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => { stylesheet = await compileAppStylesheet() }, 30_000)
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  function markup(width: number, locale: string, state: GuidedStepUpState) {
    stubViewportMedia(width)
    const copy = locale === 'en' ? en as typeof ptBR : ptBR
    const view = render(<NextIntlClientProvider locale={locale} messages={copy} timeZone="UTC"><GuidedStepUp operation="delete" state={state} /></NextIntlClientProvider>)
    const html = view.container.innerHTML
    view.unmount()
    return html
  }

  it.each(cases)('centres the $state block and holds each label on one line at $width px in $locale', async ({ width, locale, state }) => {
    const layout = await measureFlowMarkup(browser, stylesheet, width, markup(width, locale, states[state] ?? closes(locale)))
    expect(centreOffset(layout), JSON.stringify(layout)).toBeLessThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeGreaterThanOrEqual(1)
    expect(layout.questionLines, 'question').toBeLessThanOrEqual(2)
    expect(layout.overflowX, 'no word runs past the edge').toBe(false)
    for (const label of layout.labels) expect(label.lines, label.label).toBe(1)
  }, 60_000)

  it.each(FLOW_LOCALES)('keeps the confirm action at most 360 wide and in the centre under the block at 1440 px in %s', async (locale) => {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
    try {
      await page.setContent(`<!DOCTYPE html><html class="dark"><style>${stylesheet}</style><body style="margin:0"><div class="flex h-dvh flex-col">${markup(1440, locale, challenge)}</div></body></html>`)
      const geometry = await page.evaluate(() => {
        const action = document.querySelector('[data-flow-primary] button')!.getBoundingClientRect()
        const column = document.querySelector('[data-question-flow] main')!.getBoundingClientRect()
        return { width: action.width, centre: (action.left + action.right) / 2, columnCentre: (column.left + column.right) / 2 }
      })
      expect(geometry.width, JSON.stringify(geometry)).toBeLessThanOrEqual(360)
      expect(Math.abs(geometry.centre - geometry.columnCentre), JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    } finally { await page.close() }
  }, 60_000)
})
