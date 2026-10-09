import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { ProfileAstraContent } from '@/app/(app)/profile/_components/profile-astra-content'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const settings = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useTranslations: () => actual.createTranslator({ locale: settings.locale, messages: settings.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/hooks/use-stripe-checkout-return', () => ({ useStripeCheckoutReturn: () => ({ hasReturnError: false, isSettling: false }) }))
vi.mock('@/hooks/use-session-reset', () => ({ useAccountScopedState: () => [false] }))
vi.mock('@/hooks/use-account-scoped-mutation', () => ({ useAccountScopedMutation: () => ({ isPending: false, mutate: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/components/profile/profile-api-keys', () => ({ ProfileApiKeys: () => null }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ isTrialActive: false }) }) }))

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

function expectSwitchAlignment(control: { top: number; height: number; titleTop: number; titleLineHeight: number; rowHeight: number }, scale: number) {
  if (scale === 1) expect(control.rowHeight).toBe(52)
  const offset = control.titleTop - control.top
  const alignment = offset + (control.titleLineHeight - control.height) / 2
  expect(Math.abs(alignment), JSON.stringify(control)).toBeLessThanOrEqual(1)
}

const cases = (['pt-BR', 'en'] as const).flatMap((locale) => [320, 360, 384, 412].flatMap((width) => [false, true].flatMap((hasProAccess) => [1, 2].map((scale) => ({ locale, width, hasProAccess, scale })))))
it.each(cases)('keeps Astra labels whole in $locale at $width px, Pro $hasProAccess, scale $scale', async ({ locale, width, hasProAccess, scale }) => {
  settings.locale = locale
  const words = locale === 'en' ? en : ptBR
  const labels = [words.profile.allowance.title, words.profile.proactiveAstra.title, words.profile.aiSummary.title]
  const profile = createMockProfile({ hasProAccess, isTrialActive: false, aiMessagesUsed: 0, aiMessagesLimit: 15, aiSummaryEnabled: true, proactiveAstraEnabled: true })
  const { container } = render(<div style={{ padding: 16 }}><ProfileAstraContent profile={profile} patchProfile={vi.fn()} /></div>)
  const page = await browser.newPage({ viewport: { width, height: 1600 } })
  try {
    await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
    await loadAppFonts(page)
    if (scale === 2) await page.evaluate(() => {
      const sizes = [...document.querySelectorAll<HTMLElement>('body *')].map((element) => {
        const style = getComputedStyle(element)
        return { element, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) }
        document.documentElement.style.fontSize = '32px'
    })
      for (const { element, fontSize, lineHeight } of sizes) {
        element.style.fontSize = `${fontSize * 2}px`
        if (Number.isFinite(lineHeight)) element.style.lineHeight = `${lineHeight * 2}px`
      }
      document.documentElement.style.fontSize = '32px'
    })
    const measured = await page.evaluate((labels) => {
      const panel = document.querySelector<HTMLElement>('[data-testid="astra-allowance-panel"]')!
      const settings = panel.nextElementSibling as HTMLElement
      const panelBox = panel.getBoundingClientRect()
      const settingsBox = settings.getBoundingClientRect()
      const labelMeasurements = labels.map((label) => {
        const element = [...document.querySelectorAll<HTMLElement>('p, span')].find((candidate) => candidate.textContent === label && candidate.children.length === 0)!
        const range = document.createRange()
        range.selectNodeContents(element)
        const box = element.getBoundingClientRect()
        const rects = [...range.getClientRects()]
        const style = getComputedStyle(element)
        const clipped = rects.some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1)
        return { label, lines: new Set(rects.map((rect) => rect.top)).size, clipped, ellipsis: style.textOverflow === 'ellipsis' || !['none', '0'].includes(style.webkitLineClamp), fontSize: parseFloat(style.fontSize), inset: box.left - panelBox.left }
      })
      return { gap: settingsBox.top - panelBox.bottom, labels: labelMeasurements, switches: [...document.querySelectorAll('[role="switch"]')].map((control) => {
        const box = control.querySelector('[data-slot="switch-track"]')!.getBoundingClientRect()
        const row = control.closest('.orbit-list-row-shell')!
        const titleElement = row.querySelector('[data-slot="list-row-title"]')!
        const title = titleElement.getBoundingClientRect()
        return { name: control.getAttribute('aria-label'), checked: control.getAttribute('aria-checked'), width: box.width, height: box.height, top: box.top, titleTop: title.top, titleLineHeight: parseFloat(getComputedStyle(titleElement).lineHeight), rowHeight: row.getBoundingClientRect().height }
      }) }
    }, labels)
    expect.soft(measured.gap).toBe(24)
    for (const label of measured.labels) {
      expect.soft(label, JSON.stringify(measured)).toMatchObject({ clipped: false, ellipsis: false, fontSize: 17 * scale, inset: label.label === labels[0] || hasProAccess ? 16 : 56 })
      if (scale === 1) expect.soft(label.lines, label.label).toBe(1)
      else expect.soft(label.lines, label.label).toBeGreaterThanOrEqual(1)
    }
    expect(measured.switches).toHaveLength(hasProAccess ? 2 : 0)
    if (hasProAccess) for (const control of measured.switches) {
      expect(labels).toContain(control.name)
      expect(control).toMatchObject({ checked: 'true', width: 48, height: 28 })
      expectSwitchAlignment(control, scale)
    }
  } finally { await page.close() }
})
