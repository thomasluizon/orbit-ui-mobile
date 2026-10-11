import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { HabitCreateActions } from '@/components/habits/habit-create-actions'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

vi.mock('@/hooks/use-habit-create-navigation-guard', () => ({ useHabitCreateNavigationGuard: () => {} }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellComposerSlot: () => {} }))

function renderFooter(locale: 'en' | 'pt-BR', empty = true, pending = false) {
  const messages = locale === 'en' ? en : ptBr
  return render(<NextIntlClientProvider locale={locale} messages={messages}>
    <main style={{ maxWidth: 740, marginInline: 'auto' }}>
      <HabitCreateFrame presentation="screen" open fromConversation={false} actionRefreshKey="test"
        leaving={false} onNavigate={() => {}} onReturn={() => {}} title={messages.habits.form.newHabit}
        actions={<HabitCreateActions presentation="screen" pending={pending} empty={empty} subHabit={false}
          online formId="create-habit" onCancel={() => {}} />}>
        <form id="create-habit" />
      </HabitCreateFrame>
    </main>
  </NextIntlClientProvider>)
}

describe('habit create footer', () => {
  let browserLaunch: BrowserLaunch | undefined
  let browser: Browser
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

  for (const locale of ['en', 'pt-BR'] as const) {
    it.each([412, 639, 640, 1352])(`aligns the ${locale} reason with the responsive submit at %ipx`, async (width) => {
      const { container } = renderFooter(locale)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const geometry = await page.locator('[data-habit-create-action]').evaluate((footer) => {
          const button = footer.querySelector('button')!
          const reason = document.getElementById(button.getAttribute('aria-describedby')!)!
          const buttonBox = button.getBoundingClientRect()
          const reasonBox = reason.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(reason)
          const textBox = range.getBoundingClientRect()
          return {
            buttonStart: buttonBox.left, buttonWidth: buttonBox.width, reasonWidth: reasonBox.width,
            buttonCenter: buttonBox.left + buttonBox.width / 2,
            textStart: textBox.left, textCenter: textBox.left + textBox.width / 2,
            reasonTop: reasonBox.top, buttonBottom: buttonBox.bottom, disabled: button.disabled,
          }
        })
        expect(geometry.disabled).toBe(true)
        expect(geometry.reasonTop).toBeGreaterThanOrEqual(geometry.buttonBottom)
        if (width < 640) {
          expect(geometry.buttonWidth).toBeCloseTo(geometry.reasonWidth, 1)
          expect(geometry.textCenter).toBeCloseTo(geometry.buttonCenter, 1)
        } else {
          expect(geometry.buttonWidth).toBeLessThan(geometry.reasonWidth)
          expect(geometry.textStart).toBeCloseTo(geometry.buttonStart, 1)
        }
      } finally {
        await page.close()
      }
    })
  }

  it('removes the empty reason when ready and keeps the label while submitting', () => {
    const { unmount } = renderFooter('en', false)
    const ready = screen.getByRole('button', { name: en.habits.createHabit })
    expect(ready).toBeEnabled()
    expect(ready).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText(en.habits.form.createWhy)).not.toBeInTheDocument()
    unmount()
    renderFooter('en', false, true)
    expect(screen.getByRole('button', { name: en.habits.createHabit })).toBeDisabled()
    expect(screen.getByRole('button', { name: en.habits.createHabit })).toHaveAttribute('aria-busy', 'true')
  })
})
