import { createRef } from 'react'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import { AstraConversation } from '@/components/chat/conversation'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { buildComposerChips } from '@orbit/shared/chat'
import { toComposerSuggestions } from '@orbit/shared/contracts/composer'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '@orbit/shared/chat/prompt-library'
import { PromptLibrary } from '@/components/chat/prompt-library'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { contrastOnSurface, controlContrast } from '@orbit/shared/__tests__/contrast'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { expectLabelsFit, markRequiredLabels } from '@/e2e/layout/label-fit-contract'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => <div style={{ height: 128 }} /> }))

let browserLaunch: BrowserLaunch | undefined
let browser: Browser
let stylesheet: string
registerChromeLaunchHook(beforeAll, async launch => { browserLaunch = launch; browser = await launch })
beforeAll(async () => {
  const source = resolve(process.cwd(), 'app/globals.css')
  stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
})
afterEach(() => { cleanup(); vi.doUnmock('@/components/chat/prompt-library') })
afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

function libraryMarkup(container: HTMLElement, appearance: 'dark' | 'light' = 'dark') {
  const snapshot = container.cloneNode(true) as HTMLElement
  const library = snapshot.querySelector<HTMLElement>('[data-prompt-library]')!
  library.style.opacity = '1'
  library.style.transform = 'none'
  const variables = Object.entries(resolveWebThemeVariables('orange', appearance)).map(([key, value]) => `${key}:${value}`).join(';')
  return `<html class="${appearance}" style="${variables}"><style>${stylesheet}</style><body>${snapshot.innerHTML}</body></html>`
}

const cases = [320, 360, 384, 412, 1352].flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale })))
it.each(cases)('keeps every template label whole and categories on one row at $width in $locale', async ({ width, locale }) => {
  const messages = locale === 'en' ? en : pt
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <div style={{ position: 'relative', width: Math.min(width, 740), marginInline: 'auto', height: 800 }}><PromptLibrary onBack={() => {}} onSelect={() => {}} suggestions={[]} hasProAccess hasGoogleConnection /></div>
  </NextIntlClientProvider>)
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    for (const category of PROMPT_CATEGORIES) {
      fireEvent.click(screen.getByRole('button', { name: messages.chat.templates.categories[category] }))
      const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
      library.style.opacity = '1'
      library.style.transform = 'none'
      for (const appearance of ['dark', 'light'] as const) {
      await page.setContent(libraryMarkup(container, appearance))
      await loadAppFonts(page)
      const heading = await page.locator('h1').evaluate(element => ({ font: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize }))
      expect(heading.font).toContain('Geist')
      expect(heading.font).not.toContain('Mono')
      expect(heading.size).toBe('22px')
      const search = await page.locator('input').evaluate(element => {
        const field = element.closest('[data-focus-perimeter]')!
        return { height: element.getBoundingClientRect().height, radius: getComputedStyle(field).borderRadius, placeholder: element.getAttribute('placeholder') }
      })
      expect(search).toEqual({ height: 54, radius: '12px', placeholder: messages.chat.templates.search })
      const titles = page.locator('[data-slot="prompt-idea-title"]')
      expect(await titles.count()).toBe(PROMPT_TEMPLATES.filter(template => template.category === category).length)
      await markRequiredLabels(titles)
      await expectLabelsFit(page, page.locator('[data-prompt-library]'))
      const filter = await page.locator('[data-prompt-categories]').evaluate(element => {
        const children = Array.from(element.children).map(child => child.getBoundingClientRect())
        const style = getComputedStyle(element)
        return { wrap: style.flexWrap, tops: children.map(child => child.top), height: element.clientHeight, overflow: style.overflowX, scrollbar: style.scrollbarWidth }
      })
      expect(filter.wrap).toBe('nowrap')
      expect(new Set(filter.tops).size).toBe(1)
      expect(filter.height).toBeGreaterThanOrEqual(48)
      expect(filter.overflow).toBe('scroll')
      expect(filter.scrollbar).toBe('thin')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      }
    }
  } finally { await page.close() }
}, 30_000)

it('paints the library above the retained conversation', async () => {
  const chat = {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: true,
    canShowFollowUps: false, sendMessage: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><div style={{ width: 320, height: 800 }}><AstraConversation chat={chat} /></div></NextIntlClientProvider>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Browse ideas' })[0]!)
  await screen.findByRole('heading', { name: 'Ideas' })
  const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
  library.style.opacity = '1'
  library.style.transform = 'none'
  const page = await browser.newPage({ viewport: { width: 320, height: 800 } })
  try {
    await page.setContent(libraryMarkup(container))
    await loadAppFonts(page)
    const above = await page.evaluate(() => {
      document.querySelector('[inert]')?.removeAttribute('inert')
      return !!document.elementFromPoint(280, 24)?.closest('[data-prompt-library]')
    })
    expect(above).toBe(true)
  } finally { await page.close() }
})

it.each(cases)('keeps the failed load and its recovery controls visible at $width in $locale', async ({ width, locale }) => {
  vi.doMock('@/components/chat/prompt-library', () => { throw new Error('Library chunk unavailable') })
  const messages = locale === 'en' ? en : pt
  const chat = {
    threadScroll: createChatThreadScroll(), scrollToBottom: vi.fn(), chatContainerRef: createRef<HTMLDivElement>(),
    messages: [], activeSteps: [], isTyping: false, streamingMessageId: null, showSuggestions: true,
    canShowFollowUps: false, sendMessage: vi.fn(), composerProps: { suggestions: [] },
  } as unknown as Parameters<typeof AstraConversation>[0]['chat']
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <div style={{ width, height: 800 }}><AstraConversation chat={chat} /></div>
  </NextIntlClientProvider>)
  fireEvent.click(screen.getAllByRole('button', { name: messages.chat.templates.browse })[0]!)
  await screen.findByRole('alert')
  const page = await browser.newPage({ viewport: { width, height: 800 } })
  try {
    for (const appearance of ['dark', 'light'] as const) {
      await page.setContent(libraryMarkup(container, appearance))
      await loadAppFonts(page)
      const library = page.locator('[data-prompt-library]')
      await markRequiredLabels(library.locator('h1, button'))
      await expectLabelsFit(page, library)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      const controls = await library.locator('button').evaluateAll(buttons => buttons.map(button => {
        const bounds = button.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height, top: bounds.top, bottom: bounds.bottom }
      }))
      expect(controls).toHaveLength(2)
      for (const control of controls) {
        expect(control.top).toBeGreaterThanOrEqual(0)
        expect(control.bottom).toBeLessThanOrEqual(800)
        expect(control.width).toBeGreaterThan(0)
      }
      expect(controls[0]!.height).toBeGreaterThanOrEqual(48)
    }
  } finally { await page.close() }
})

it.each(cases)('grows the actual cards at 200% and reaches the last action in a short window at $width in $locale', async ({ width, locale }) => {
  const messages = locale === 'en' ? en : pt
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}>
    <div style={{ position: 'relative', width: Math.min(width, 740), marginInline: 'auto', height: 420 }}><PromptLibrary onBack={() => {}} onSelect={() => {}} suggestions={[]} hasProAccess hasGoogleConnection /></div>
  </NextIntlClientProvider>)
  const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
  library.style.opacity = '1'
  library.style.transform = 'none'
  const page = await browser.newPage({ viewport: { width, height: 420 } })
  try {
    for (const appearance of ['dark', 'light'] as const) {
      await page.setContent(libraryMarkup(container, appearance))
      await loadAppFonts(page)
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px' })
      const cards = page.locator('[data-prompt-idea="catalog"]')
      expect(await cards.count()).toBe(6)
      const geometry = await cards.evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect()
        const title = element.querySelector<HTMLElement>('[data-slot="prompt-idea-title"]')!
        const titleBox = title.getBoundingClientRect()
        const icon = element.querySelector('[data-prompt-intent]')!.getBoundingClientRect()
        const example = element.querySelector<HTMLElement>('[data-prompt-example]')
        const exampleBox = example?.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { width: box.width, height: box.height, fontSize: parseFloat(getComputedStyle(title).fontSize), radius: style.borderRadius,
          icon: { width: icon.width, height: icon.height, top: icon.top }, titleTop: titleBox.top,
          inlineClearance: Math.min(icon.left - box.left, box.right - titleBox.right),
          exampleSize: example ? parseFloat(getComputedStyle(example).fontSize) : null,
          contained: titleBox.top >= box.top + 4 && titleBox.bottom <= box.bottom - 4 && (!exampleBox || exampleBox.bottom <= box.bottom - 4),
          clipped: title.scrollWidth > title.clientWidth || title.scrollHeight > title.clientHeight || (example ? example.scrollWidth > example.clientWidth || example.scrollHeight > example.clientHeight : false),
        }
      }))
      for (const card of geometry) {
        expect(card.fontSize).toBe(34)
        expect(card.radius).toBe('20px')
        expect(card.height).toBeGreaterThanOrEqual(48)
        expect(card.width).toBe(Math.min(width, 740) - 32)
        expect(card.inlineClearance).toBeCloseTo(16, 2)
        expect(card.icon.width).toBe(24)
        expect(card.icon.height).toBe(24)
        expect(card.icon.top).toBeCloseTo(card.titleTop, 0)
        expect(card.contained).toBe(true)
        expect(card.clipped).toBe(false)
        if (card.exampleSize) expect(card.exampleSize).toBe(28)
      }
      const scroller = page.locator('[data-prompt-results]')
      expect(await scroller.evaluate(element => element.clientHeight)).toBeGreaterThan(48)
      await scroller.evaluate(element => { element.scrollTop = element.scrollHeight })
      const reachable = await cards.last().evaluate(element => {
        const box = element.getBoundingClientRect()
        const scroller = element.closest('[data-prompt-results]')!.getBoundingClientRect()
        return box.bottom <= scroller.bottom + 1 && box.top < scroller.bottom
      })
      expect(reachable).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }
  } finally { await page.close() }
}, 30_000)

it.each(['dark', 'light'] as const)('paints one complete action shape with one focus perimeter in %s', async appearance => {
  const { container } = render(<NextIntlClientProvider locale="en" messages={en}><div style={{ position: 'relative', width: 412, height: 800 }}><PromptLibrary onBack={() => {}} onSelect={() => {}} suggestions={[]} hasProAccess hasGoogleConnection /></div></NextIntlClientProvider>)
  const library = container.querySelector<HTMLElement>('[data-prompt-library]')!
  library.style.opacity = '1'
  library.style.transform = 'none'
  const page = await browser.newPage({ viewport: { width: 412, height: 800 } })
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setContent(libraryMarkup(container, appearance))
    await loadAppFonts(page)
    const action = page.locator('[data-prompt-idea="catalog"]').first()
    const rest = await action.evaluate(element => ({ fill: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }))
    expect(rest.fill).not.toBe('rgba(0, 0, 0, 0)')
    await action.hover()
    const hover = await action.evaluate(element => ({ fill: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius, color: getComputedStyle(element).color }))
    expect(hover.fill).not.toBe(rest.fill)
    expect(hover.radius).toBe('20px')
    const tokens = resolveWebThemeVariables('orange', appearance)
    for (const paint of [rest, hover]) {
      expect(contrastOnSurface(paint.color, [tokens['--bg']!, paint.fill])).toBeGreaterThanOrEqual(4.5)
    }
    const restStep = controlContrast(rest.color, rest.fill, [tokens['--bg']!]).step
    const hoverStep = controlContrast(hover.color, hover.fill, [tokens['--bg']!]).step
    expect(appearance === 'dark' ? hoverStep / restStep : hoverStep * restStep).toBeGreaterThanOrEqual(1.25)
    await action.focus()
    const focus = await action.evaluate(element => {
      const style = getComputedStyle(element)
      return { outline: style.outlineWidth, offset: style.outlineOffset, shadow: style.boxShadow,
        nested: [...element.querySelectorAll('*')].filter(child => getComputedStyle(child).outlineStyle !== 'none' && parseFloat(getComputedStyle(child).outlineWidth) > 0).length }
    })
    expect(focus).toEqual({ outline: '2px', offset: '-4px', shadow: 'none', nested: 0 })
    const neighbors = await page.locator('[data-prompt-idea="catalog"]').evaluateAll(elements => elements.slice(0, 2).map(element => {
      const box = element.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom }
    }))
    expect(neighbors[1]!.top - neighbors[0]!.bottom).toBe(12)
  } finally { await page.close() }
})

it.each(([320, 740] as const).flatMap(width => (['en', 'pt-BR'] as const).map(locale => ({ width, locale }))))('keeps live, mixed search, paging, empty and disabled states bounded at $width in $locale', async ({ width, locale }) => {
  const messages = locale === 'en' ? en : pt
  const t = createTranslator({ locale, messages })
  const onSelect = vi.fn()
  const suggestions = toComposerSuggestions(buildComposerChips({ surface: 'today', status: 'success', habits: [], totalHabitCount: 0, profile: createMockProfile() }).map(chip => ({ id: chip.id, label: t(chip.key as Parameters<typeof t>[0]), onSelect })))
  const view = (disabledReason?: string) => <NextIntlClientProvider locale={locale} messages={messages}><div style={{ position: 'relative', width, height: 420 }}><PromptLibrary onBack={vi.fn()} onSelect={onSelect} suggestions={suggestions} hasProAccess hasGoogleConnection disabledReason={disabledReason} /></div></NextIntlClientProvider>
  const { container, rerender } = render(view())
  const page = await browser.newPage({ viewport: { width, height: 420 } })
  const search = screen.getByRole('searchbox')
  try {
    const block = (reason: string) => {
      fireEvent.change(search, { target: { value: '' } })
      rerender(view(reason))
    }
    const states = [
      { name: 'live', prepare: () => {}, live: true, disabled: false, catalog: 6 },
      { name: 'search', prepare: () => fireEvent.change(search, { target: { value: 'e' } }), live: false, disabled: false, catalog: 8 },
      { name: 'page', prepare: () => fireEvent.click(screen.getByRole('button', { name: messages.chat.templates.more })), live: false, disabled: false, catalog: 8 },
      { name: 'empty', prepare: () => fireEvent.change(search, { target: { value: 'zzzzzzzz' } }), live: false, disabled: true, catalog: 0 },
      { name: 'offline', prepare: () => block(t('shell.composer.offline.reason')), live: true, disabled: true, catalog: 6 },
      { name: 'limit', prepare: () => block(t('shell.composer.limit.reason', { allowance: 5 })), live: true, disabled: true, catalog: 6 },
      { name: 'busy', prepare: () => block(t('shell.composer.busy.reason')), live: true, disabled: true, catalog: 6 },
    ]
    for (const state of states) {
      state.prepare()
      for (const appearance of ['dark', 'light'] as const) {
        await page.setContent(libraryMarkup(container, appearance))
        await loadAppFonts(page)
        const library = page.locator('[data-prompt-library]')
        const bounds = await page.locator('[data-prompt-results]').boundingBox()
        expect(bounds!.height).toBeGreaterThan(48)
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(420)
        expect(await page.locator('[data-prompt-idea="live"]').count()).toBe(state.live ? suggestions.length : 0)
        const actions = page.locator('[data-prompt-idea]')
        const rowStyles = await actions.evaluateAll(elements => elements.map(element => {
          const style = getComputedStyle(element)
          return { fill: style.backgroundColor, radius: style.borderRadius, padding: style.padding }
        }))
        if (rowStyles.length > 0) expect(rowStyles.every(style => JSON.stringify(style) === JSON.stringify(rowStyles[0])), state.name).toBe(true)
        const disabled = await actions.evaluateAll(elements => elements.every(element => (element as HTMLButtonElement).disabled))
        expect(disabled, state.name).toBe(state.disabled)
        expect(await page.locator('[data-prompt-idea="catalog"]').count(), state.name).toBe(state.catalog)
        await markRequiredLabels(library.locator('h1, [data-slot="prompt-idea-title"]'))
        await expectLabelsFit(page, library)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      }
    }
    expect(onSelect).not.toHaveBeenCalled()
  } finally { await page.close() }
}, 30_000)
