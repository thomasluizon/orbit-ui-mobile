import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Page } from 'playwright-core'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

const context = vi.hoisted(() => ({ locale: 'en' as 'en' | 'pt-BR' }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  const english = (await import('@orbit/shared/i18n/en.json')).default
  const portuguese = (await import('@orbit/shared/i18n/pt-BR.json')).default
  return {
    ...actual,
    useLocale: () => context.locale,
    useTranslations: (namespace?: 'onboarding.flow') => actual.createTranslator({ locale: context.locale, messages: context.locale === 'en' ? english : portuguese, namespace }),
  }
})
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

import { MoveParentOverlay, type MoveParentOption } from '@/components/habits/habit-list/move-parent-overlay'

const CASES = [320, 1280].flatMap((width) => [1, 2].flatMap((scale) => (['en', 'pt-BR'] as const).flatMap((locale) => (['light', 'dark'] as const).map((mode) => ({ width, scale, locale, mode })))))

function option(index: number): MoveParentOption {
  return { id: `habit-${index}`, label: `Habit ${index}`, emoji: null, depth: 0, childCount: 0, disabled: false, reason: null }
}

async function openPage(browser: Browser, stylesheet: string, markup: string, { width, scale, mode }: { width: number; scale: number; mode: 'light' | 'dark' }) {
  const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
  const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
  await page.setContent(`<!doctype html><style>${stylesheet}:root{${tokens};font-size:${16 * scale}px}body{margin:0;background:var(--bg)}main{padding:16px}</style><main>${markup}</main>`)
  await loadAppFonts(page)
  return page
}

function childGaps(page: Page, selector: string) {
  return page.evaluate((root) => {
    const children = [...document.querySelector(root)!.children].filter((child) => getComputedStyle(child).display !== 'none' && getComputedStyle(child).position !== 'absolute')
    return children.slice(1).map((child, index) => child.getBoundingClientRect().top - children[index]!.getBoundingClientRect().bottom)
  }, selector)
}

function questionGaps(page: Page, selector: string, labelSelector = '[data-field-question]') {
  return page.evaluate(({ root, label: labels }) => [...document.querySelector(root)!.querySelectorAll(labels)]
    .filter((label) => label.nextElementSibling)
    .map((label) => ({ question: label.textContent, gap: label.nextElementSibling!.getBoundingClientRect().top - label.getBoundingClientRect().bottom })), { root: selector, label: labelSelector })
}

describe('input question surface geometry', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (pending) => { launch = pending; browser = await pending })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
  }, 30_000)
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  it.each(CASES)('asks the move destination one group below its search at $width and $scale in $locale/$mode', async ({ width, scale, locale, mode }) => {
    context.locale = locale
    const messages = locale === 'en' ? en : ptBR
    const t = createTranslator({ locale, messages }) as unknown as (key: string, params?: Record<string, string | number | Date>) => string
    render(<MoveParentOverlay t={t} open isMoving={false} movingHabitTitle="Exercise" movingHabitParentId={null} options={[{ ...option(0), id: null, label: messages.habits.moveParent.toRoot }, ...Array.from({ length: 9 }, (_, index) => option(index + 1))]}
      selectedMoveParentId={null} canSubmit={false} onClose={vi.fn()} onConfirm={vi.fn()} onSelectOption={vi.fn()} />)
    const question = t('habits.moveParent.destinations', { count: 1 })
    expect(screen.getByRole('radiogroup', { name: question })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: messages.habits.moveParent.searchQuestion })).toBeInTheDocument()
    const markup = document.querySelector('[data-move-parent-questions]')!.outerHTML
    cleanup()
    const page = await openPage(browser, stylesheet, markup, { width, scale, mode })
    try {
      const groups = await childGaps(page, '[data-move-parent-questions]')
      expect(groups.length).toBeGreaterThanOrEqual(1)
      for (const gap of groups.slice(0, 1)) expect(gap).toBeCloseTo(16, 0)
    } finally { await page.close() }
  })
})
