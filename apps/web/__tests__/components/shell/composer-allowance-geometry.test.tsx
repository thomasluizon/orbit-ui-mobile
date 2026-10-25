import { geometryProps, liveChipSuggestions, compileComposerGeometry } from '@/__tests__/support/composer-geometry'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { toComposerSuggestions, type ComposerProps } from '@orbit/shared/contracts/composer'
import { createTranslator } from 'next-intl'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Composer } from '@/components/shell/composer'
import { AI_MESSAGE_COUNTER_THRESHOLD } from '@orbit/shared/chat'
import { MAX_ACTIVE_HABITS } from '@orbit/shared/validation'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

function allowanceConfiguration(messages: typeof en, locale: 'en' | 'pt-BR', used: number, limit: number, withSuggestions: boolean) {
  const nearLimit = limit - used <= AI_MESSAGE_COUNTER_THRESHOLD
  const translate = createTranslator({ locale, messages })
  return {
    ...geometryProps(used === limit ? 'atLimit' : 'idle', messages, false), value: 'Keep this draft',
    suggestions: withSuggestions && used < limit ? toComposerSuggestions(liveChipSuggestions('habitDetail', messages).suggestions.map(suggestion => ({ ...suggestion, onSelect: vi.fn() }))) : [],
    usageMessage: nearLimit && used < limit ? translate('shell.composer.usage', { used, limit }) : undefined,
    allowanceReason: nearLimit ? translate('shell.composer.limit.reason', { allowance: limit }) : undefined,
    renewalHint: nearLimit ? messages.shell.composer.limit.renewal : undefined,
    ...(used === limit ? { state: 'atLimit', limitReason: translate('shell.composer.limit.reason', { allowance: limit }) } : {}),
  } as ComposerProps
}

function readAllowanceGeometry(root: Element) {
  const input = root.querySelector('[data-composer-input]')!
  const usage = root.querySelector('[data-composer-usage]')
  const row = root.querySelector('[data-composer-input-row]')!
  const slot = root.querySelector('[data-composer-status-slot]')
  const reason = root.querySelector('[data-composer-allowance-reason]')
  const renewal = root.querySelector('[data-composer-renewal]')
  const style = getComputedStyle(root)
  return { top: input.getBoundingClientRect().top, height: root.getBoundingClientRect().height,
    overflow: root.scrollWidth > root.clientWidth, numeric: usage ? getComputedStyle(usage).fontVariantNumeric : null,
    reserved: Boolean(slot), reservedHeight: slot?.getBoundingClientRect().height ?? 0,
    reservedMinimum: slot ? parseFloat(getComputedStyle(slot).minHeight) : 0,
    noticeHeight: reason && renewal ? reason.getBoundingClientRect().height + renewal.getBoundingClientRect().height + parseFloat(getComputedStyle(renewal.parentElement!).gap) : 0,
    visibleStatusText: [...(slot?.querySelectorAll('p, [data-suggestion-label]') ?? [])].filter(element => getComputedStyle(element).visibility !== 'hidden').map(element => element.textContent).join(''),
    inset: row.getBoundingClientRect().top - root.getBoundingClientRect().top,
    expected: parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) }
}

function expectAllowanceGeometry(geometry: ReturnType<typeof readAllowanceGeometry>, nearLimit: boolean, exhausted: boolean, withSuggestions: boolean) {
  expect(geometry.overflow).toBe(false)
  expect(geometry.reserved).toBe(nearLimit)
  if (!nearLimit) {
    expect(geometry.numeric).toBeNull()
    if (!withSuggestions) expect(geometry.inset).toBe(geometry.expected)
    return
  }
  expect(geometry.visibleStatusText.length).toBeGreaterThan(0)
  expect(geometry.reservedMinimum).toBe(96)
  expect(geometry.reservedHeight).toBeCloseTo(Math.max(96, geometry.noticeHeight), 1)
  if (!exhausted) expect(geometry.numeric).toContain('tabular-nums')
  else expect(geometry.numeric).toBeNull()
}


describe('Composer compact geometry in Chromium', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  let composerScript: string
  registerChromeLaunchHook(beforeAll, async (launch) => { browserLaunch = launch; browser = await launch })
  beforeAll(async () => {
    ({ stylesheet, composerScript } = await compileComposerGeometry())
  })
  afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

  it('keeps the compact composer inset when no daily allowance hint is supplied', async () => {
    const view = render(<Composer {...geometryProps('idle', en, false)} />)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const geometry = await page.locator('[data-composer-root]').evaluate((root) => {
        const input = root.querySelector('[data-composer-input-row]')!
        const style = getComputedStyle(root)
        return { inset: input.getBoundingClientRect().top - root.getBoundingClientRect().top,
          expected: Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.paddingTop) }
      })
      expect(geometry.inset).toBe(geometry.expected)
    } finally { view.unmount(); await page.close() }
  })

  const allowanceCases = [320, 412].flatMap(width => (['en', 'pt-BR'] as const).flatMap(locale =>
    (['light', 'dark'] as const).flatMap(mode => [5, 50].flatMap(limit => [false, true].map(withSuggestions =>
      ({ width, locale, mode, limit, withSuggestions, fontScale: 1 }))))))
    .concat((['en', 'pt-BR'] as const).map(locale => ({ width: 320, locale, mode: 'dark' as const, limit: 50, withSuggestions: true, fontScale: 2 })))

  it.each(allowanceCases)('keeps Hoje stable near $limit messages at $width in $locale $mode with chips $withSuggestions and scale $fontScale', async ({ width, locale, mode, limit, withSuggestions, fontScale }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    const measured: Array<{ top: number; height: number }> = []
    try {
      for (const used of [limit - 3, limit - 2, limit - 1, limit]) {
        const nearLimit = limit - used <= AI_MESSAGE_COUNTER_THRESHOLD
        const configuration = allowanceConfiguration(messages, locale, used, limit, withSuggestions)
        await page.setContent(`<style>${stylesheet}:root{${theme}}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
        await page.addScriptTag({ content: composerScript })
        await loadAppFonts(page)
        const geometry = await page.locator('[data-composer-root]').evaluate(readAllowanceGeometry)
        expectAllowanceGeometry(geometry, nearLimit, used === limit, withSuggestions)
        measured.push({ top: geometry.top, height: geometry.height })
      }
      expect(measured[0]!.height).toBeLessThan(measured[1]!.height)
      expect(measured[1]).toEqual(measured[2])
      expect(measured[2]).toEqual(measured[3])
    } finally { await page.close() }
  })

  it.each(allowanceCases)('keeps the mounted allowance frame before and after font measurement at $width in $locale $mode near $limit with chips $withSuggestions and scale $fontScale', async ({ width, locale, mode, limit, withSuggestions, fontScale }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const configuration = allowanceConfiguration(messages, locale, limit - 1, limit, withSuggestions)
    const page = await browser.newPage({ viewport: { width, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}:root{${theme}}html{font-size:${16 * fontScale}px}</style><div id="root"></div><script id="configuration" type="application/json">${JSON.stringify(configuration)}</script>`)
      await page.addScriptTag({ content: composerScript })
      const root = page.locator('[data-composer-root]')
      await page.locator('#root[data-composer-test-ready]').waitFor()
      for (const phase of ['initial', 'fonts'] as const) {
        if (phase === 'fonts') await loadAppFonts(page)
        const frames: Array<{ top: number; height: number }> = []
        const snapshots = []
        for (const used of [limit - 1, limit, limit - 1, limit]) {
          const next = allowanceConfiguration(messages, locale, used, limit, withSuggestions)
          await page.evaluate(nextProps => document.dispatchEvent(new CustomEvent('composer-test-props', { detail: JSON.parse(nextProps) })), JSON.stringify(next))
          await expect.poll(() => root.getAttribute('data-state')).toBe(next.state)
          const geometry = await root.evaluate(readAllowanceGeometry)
          const snapshot = await page.locator('[data-composer-input]').evaluate(input => {
            const row = input.closest<HTMLElement>('[data-composer-input-row]')!
            const style = getComputedStyle(input)
            return { input: { top: input.getBoundingClientRect().top, width: input.clientWidth, height: input.clientHeight,
              minimum: style.minWidth, font: style.font, placeholder: (input as HTMLTextAreaElement).placeholder },
              pill: { top: row.getBoundingClientRect().top, height: row.getBoundingClientRect().height },
              targets: [...row.querySelectorAll('button')].map(button => ({ name: button.getAttribute('aria-label'),
                top: button.getBoundingClientRect().top, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
              reserved: Boolean(row.querySelector('[data-composer-text-action-slot]')) }
          })
          snapshots.push({ phase, used, snapshot, geometry })
          expectAllowanceGeometry(geometry, true, used === limit, withSuggestions)
          frames.push({ top: geometry.top, height: geometry.height })
        }
        for (const frame of frames.slice(1)) expect(frame, JSON.stringify(snapshots)).toEqual(frames[0])
      }
    } finally { await page.close() }
  })

  it.each(['en', 'pt-BR'] as const)('keeps the 50-message counter on one line at 320 in %s', async (locale) => {
    const messages = locale === 'en' ? en : ptBR
    const translate = createTranslator({ locale, messages })
    const view = render(<Composer {...geometryProps('idle', messages, false)}
      allowanceReason={translate('shell.composer.limit.reason', { allowance: 50 })}
      renewalHint={messages.shell.composer.limit.renewal}
      usageMessage={translate('shell.composer.usage', { used: 48, limit: 50 })} />)
    const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      const lines = await page.locator('[data-composer-usage]').evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))
      expect(lines).toBeCloseTo(1, 1)
    } finally { view.unmount(); await page.close() }
  })

  it.each((['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ locale, mode }))))('keeps the habit capacity message neutral and contained in $locale $mode', async ({ locale, mode }) => {
    const messages = locale === 'en' ? en : ptBR
    const theme = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
    const body = createTranslator({ locale, messages })('habits.form.capacityBody', { limit: MAX_ACTIVE_HABITS })
    const view = render(<main style={{ padding: 16 }}><input aria-label="Draft" defaultValue="Morning walk" /><CapacityNotice message={messages.habits.form.capacityTitle} body={body} /></main>)
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    try {
      await page.setContent(`<style>${stylesheet}:root{${theme}}</style>${view.container.innerHTML}`)
      await loadAppFonts(page)
      expect(await page.locator('input').inputValue()).toBe('Morning walk')
      const geometry = await page.locator('[data-capacity-notice]').evaluate((notice) => {
        const title = notice.querySelector('p')!
        return { overflow: notice.scrollWidth > notice.clientWidth, titleHeight: title.getBoundingClientRect().height,
          titleLine: Number.parseFloat(getComputedStyle(title).lineHeight), colors: [...notice.querySelectorAll('p')].map((element) => getComputedStyle(element).color),
          neutral: ['--fg-1', '--fg-2'].map((token) => {
            const probe = document.createElement('span')
            probe.style.color = `var(${token})`
            notice.append(probe)
            const color = getComputedStyle(probe).color
            probe.remove()
            return color
          }) }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.titleHeight).toBeLessThanOrEqual(geometry.titleLine + 1)
      expect(await page.locator('[data-capacity-notice] button').count()).toBe(0)
      expect(await page.locator('[data-capacity-notice]').textContent()).toContain(locale === 'pt-BR' ? '1.000' : '1,000')
      expect(geometry.colors).toEqual(geometry.neutral)
    } finally { view.unmount(); await page.close() }
  })
})
