import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render } from '@testing-library/react'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitChecklist } from '@/components/habits/habit-checklist'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { HabitCreateFrame } from '@/components/habits/habit-create-frame'
import { ShellWide } from '@/components/shell/shell-wide'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'

const language = vi.hoisted(() => ({ value: 'en' }))
vi.mock('next-intl', async (importActual) => ({
  ...await importActual<typeof import('next-intl')>(),
  useTranslations: () => createTranslator({ locale: language.value, messages: language.value === 'en' ? en : ptBR }),
}))
vi.mock('@/hooks/use-habit-create-navigation-guard', () => ({ useHabitCreateNavigationGuard: () => {} }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/destination-shell', () => ({ useShellComposerSlot: () => {} }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: profileFixture }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-config', () => ({ useConfig: () => ({ config: { features: {} } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }), useCreateTag: () => ({ isPending: false }),
  useUpdateTag: () => ({ isPending: false }), useDeleteTag: () => ({ isPending: false }),
  useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: () => ({ toggleReminder: vi.fn(), showNotice: false }) }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))

function CreateForm() {
  const form = useHabitForm()
  const tags = useTagSelection()
  return <ShellWide nav={false}><HabitCreateFrame presentation="screen" open fromConversation={false} leaving={false}
    actionRefreshKey="test" onNavigate={vi.fn()} onReturn={vi.fn()}>
    <HabitFormFields formHelpers={form} tags={tags} selectedGoalIds={[]} atGoalLimit={false} onToggleGoal={vi.fn()}
      reminderTimes={[]} onReminderTimesChange={vi.fn()} />
  </HabitCreateFrame></ShellWide>
}

describe('Checklist add row geometry in Chromium', () => {
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

  it.each(['dark', 'light'] as const)('keeps the opening create disclosure gap exact with reduced motion in %s', async (mode) => {
    language.value = 'pt-BR'
    const mounted = render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><CreateForm /></NextIntlClientProvider>)
    fireEvent.click(mounted.getByRole('button', { name: ptBR.habits.form.moreDetails }))
    const disclosure = mounted.container.querySelector<HTMLElement>('.habit-form-disclosure[data-open="true"]')!
    disclosure.hidden = true
    const markup = mounted.container.innerHTML
    mounted.unmount()
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, reducedMotion: 'reduce', colorScheme: mode })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}: ${value};`).join(' ')
      await page.setContent(`<style>${stylesheet}:root { ${variables} }</style>${markup}`)
      const geometry = await page.evaluate(() => {
        const disclosure = document.querySelector<HTMLElement>('.habit-form-disclosure')!
        void disclosure.offsetWidth
        disclosure.hidden = false
        void disclosure.offsetWidth
        for (const animation of disclosure.getAnimations()) { animation.pause(); animation.currentTime = 0 }
        const input = disclosure.querySelector('input[name="checklistItem"]')!
        const field = input.closest('[data-focus-perimeter]')!
        const add = field.closest('[data-input-root]')!.parentElement!.nextElementSibling!
        const column = document.querySelector('[data-habit-create-screen]')!.getBoundingClientRect()
        return { gap: add.getBoundingClientRect().left - field.getBoundingClientRect().right, left: column.left, transform: getComputedStyle(disclosure).transform }
      })
      expect(geometry.gap, JSON.stringify(geometry)).toBe(8)
      expect(Number.isInteger(geometry.left)).toBe(true)
    } finally { await page.close() }
  })

  it.each(['dark', 'light'] as const)('keeps separate full field and ghost pill geometry in %s', async (mode) => {
    const page = await browser.newPage()
    try {
      for (const locale of ['en', 'pt-BR']) {
        language.value = locale
        const messages = locale === 'en' ? en : ptBR
        for (const populated of [false, true]) {
          const mounted = render(<HabitChecklist items={populated ? [{ text: 'Prepare coffee', isChecked: false }] : []} editable />)
          const markup = mounted.container.innerHTML
          mounted.unmount()
          const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}: ${value};`).join(' ')
          await page.setContent(`<!doctype html><style>${stylesheet} :root { ${variables} } body { margin: 0; padding: 24px; } main { max-width: 740px; margin: auto; }</style><main>${markup}</main>`)
          for (const width of [320, 412, 1352]) {
            await page.setViewportSize({ width, height: 915 })
            const input = page.getByPlaceholder(messages.habits.form.checklistPlaceholder)
            const add = page.getByRole('button', { name: messages.common.add, exact: true })
            const field = await input.evaluate((element) => {
              const perimeter = element.closest('[data-focus-perimeter]')!
              const bounds = perimeter.getBoundingClientRect()
              const style = getComputedStyle(perimeter)
              return { right: bounds.right, center: bounds.y + bounds.height / 2, height: bounds.height, radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius] }
            })
            const pill = await add.evaluate((element) => {
              const bounds = element.getBoundingClientRect()
              const style = getComputedStyle(element)
              return { left: bounds.left, center: bounds.y + bounds.height / 2, width: bounds.width, height: bounds.height, radius: Number.parseFloat(style.borderTopLeftRadius), background: style.backgroundColor, opacity: style.opacity }
            })
            expect(pill.left - field.right, `${locale} ${width}px gap`).toBe(8)
            expect(field.radii).toEqual(['12px', '12px', '12px', '12px'])
            expect(field.height).toBe(54)
            expect(pill.width).toBe(44)
            expect(pill.height).toBe(44)
            expect(pill.center).toBe(field.center)
            expect(pill.radius).toBeGreaterThanOrEqual(22)
            expect(pill.background).toBe('rgba(0, 0, 0, 0)')
            expect(pill.opacity).toBe('0.4')
            expect(await add.isDisabled()).toBe(true)
          }
        }
      }
    } finally {
      await page.close()
    }
  })
})
