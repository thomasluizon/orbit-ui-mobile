import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTranslator } from 'next-intl'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { formatPrice } from '@orbit/shared/utils'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { subscriptionStatusSchema } from '@orbit/shared/types/profile'
import { billingDetailsSchema } from '@orbit/shared/types/subscription'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const status = subscriptionStatusSchema.parse({ ...createMockProfile({ plan: 'pro', hasProAccess: true }), source: 'stripe' })
const billing = billingDetailsSchema.parse({
  status: 'active', currentPeriodEnd: '2026-10-04T12:00:00Z', cancelAtPeriodEnd: false,
  interval: 'yearly', amountPerPeriod: 4990, currency: 'brl', paymentMethod: null,
  recentInvoices: ['subscription_cycle', 'subscription_create', 'subscription_update', 'manual'].flatMap((billingReason) =>
    ['paid', 'open', 'void'].map((status) => ({
      id: `${billingReason}-${status}`, date: '2026-09-04T12:00:00Z', amountPaid: 4990, currency: 'brl', status,
      invoicePdf: status === 'void' ? null : 'https://example.com/invoice.pdf', hostedInvoiceUrl: null, billingReason,
    }))),
})

let launch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
beforeAll(async () => {
  const source = resolve('app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterAll(async () => { await closeChrome(launch) }, 30_000)

it.each(['en', 'pt-BR'].flatMap((locale) => [320, 360, 375, 412, 480].flatMap((width) => [1, 2].map((scale) => ({ locale, width, scale })))))('keeps billing descriptions whole in $locale at $width, scale $scale', async ({ locale, width, scale }) => {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
  const page = await browser.newPage({ viewport: { width, height: 2000 } })
  try {
    for (const state of ['stripe', 'offline'] as const) {
      const markup = renderToStaticMarkup(<main style={{ padding: 16 }}><BillingDashboard state={state} billing={billing} status={status} locale={locale} usagePercent={0} onOpenPortal={vi.fn()} onRetryPortal={vi.fn()} t={t} /></main>)
      await page.setContent(`<style>${stylesheet}:root { font-size: ${16 * scale}px }</style>${markup}`)
      await loadAppFonts(page)
      const rows = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.orbit-list-row-shell')].map((row) => {
        const bounds = row.getBoundingClientRect()
        return [...row.querySelectorAll<HTMLElement>('[data-slot="list-row-title"], [data-slot="list-row-description"], [data-slot="list-row-value"]')].map((element) => {
          const range = document.createRange(); range.selectNodeContents(element)
          const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
          const text = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { label: element.textContent, slot: element.dataset.slot, lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
            clipped: element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight || fragments.some((rect) => rect.left < text.left - 1 || rect.right > text.right + 1 || rect.top < text.top - 1 || rect.bottom > text.bottom + 1),
            outside: text.left < bounds.left || text.right > bounds.right || text.bottom > bounds.bottom,
            ellipsis: style.textOverflow === 'ellipsis' || Number.parseInt(style.webkitLineClamp) > 0 }
        })
      }))
      expect(rows).toHaveLength(billing.recentInvoices.length)
      for (const texts of rows) expect(texts).toHaveLength(3)
      for (const texts of rows) for (const text of texts) {
        expect.soft(text, JSON.stringify(text)).toMatchObject({ clipped: false, outside: false, ellipsis: false })
        if (scale === 1) expect.soft(text.lines, text.label!).toBe(1)
      }
    }
  } finally { await page.close() }
})

it.each(['en', 'pt-BR'].flatMap((locale) => ['light', 'dark'].flatMap((mode) => [320, 360, 384, 412, 740].flatMap((width) => [1, 2].map((scale) => ({ locale, mode, width, scale }))))))('keeps the billed charge and reference readable in $locale $mode at $width, scale $scale', async ({ locale, mode, width, scale }) => {
  const t = createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
  const page = await browser.newPage({ viewport: { width, height: 2000 } })
  try {
    for (const interval of ['monthly', 'yearly']) {
      const discounted = billingDetailsSchema.parse({ ...billing, interval, billedAmountPerPeriod: 3992, recentInvoices: [] })
      const markup = renderToStaticMarkup(<main style={{ padding: 16 }}><BillingDashboard state="stripe" billing={discounted} status={status} locale={locale} usagePercent={0} onOpenPortal={vi.fn()} onRetryPortal={vi.fn()} t={t} /></main>)
      await page.setContent(`<html class="${mode}"><style>${stylesheet}:root { font-size: ${16 * scale}px }</style>${markup}</html>`)
      await loadAppFonts(page)
      const price = await page.evaluate(({ charge, reference }) => {
        const line = [...document.querySelectorAll('p')].find((element) => element.textContent.includes(charge) && element.textContent.includes(reference))
        if (!line) return null
        const range = document.createRange(); range.selectNodeContents(line)
        const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0)
        const figures = [...line.querySelectorAll('span')].map((element) => ({ color: getComputedStyle(element).color, decoration: getComputedStyle(element).textDecorationLine }))
        return { lines: new Set(fragments.map((rect) => Math.round(rect.top))).size,
          clipped: line.scrollWidth > line.clientWidth || line.scrollHeight > line.clientHeight,
          outside: fragments.some((rect) => rect.left < 16 - 1 || rect.right > innerWidth - 16 + 1),
          figures }
      }, { charge: formatPrice(3992, 'brl'), reference: formatPrice(billing.amountPerPeriod, 'brl') })
      expect(price).not.toBeNull()
      expect(price).toMatchObject({ clipped: false, outside: false, figures: [{ decoration: 'none' }, { decoration: 'none' }] })
      if (scale === 1) expect(price?.lines).toBe(1)
      const colors = await page.evaluate(() => ['--fg-1', '--fg-3'].map((token) => {
        const probe = document.createElement('span'); probe.style.color = `var(${token})`; document.body.append(probe)
        const color = getComputedStyle(probe).color; probe.remove(); return color
      }))
      expect(price?.figures.map((figure) => figure.color)).toEqual(colors)
    }
  } finally { await page.close() }
})
