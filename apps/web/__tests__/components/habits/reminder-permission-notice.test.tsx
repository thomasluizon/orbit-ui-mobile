import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import en from '@orbit/shared/i18n/en.json'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ReminderSection } from '@/components/habits/habit-form-fields/reminder-section'
import { ScheduledReminderSection } from '@/components/habits/habit-form-fields/scheduled-reminder-section'

vi.mock('@/hooks/use-push-subscriptions', () => ({
  usePushSubscriptions: () => ({ count: 0, max: 5, isCurrentDeviceRegistered: false, isLoading: false, isError: false }),
}))


vi.mock('@/hooks/use-push-notification-preferences', () => ({
  isPushNotificationSupported: () => true,
  subscribeToPushNotifications: vi.fn(),
}))

vi.mock('next-intl', () => ({ useLocale: () => 'en' }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))

const t = ((key: string) => key) as Parameters<typeof ReminderSection>[0]['t']

describe('reminder permission notice', () => {
  it('keeps an unsaved offset reminder open while settings open in another tab', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ReminderSection reminderEnabled reminderTimes={[15]} onReminderTimesChange={vi.fn()} onToggleReminder={vi.fn()} reminderLabel={() => '15 min'} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.reminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('habits.form.reminderPermissionNeeded')
    expect(screen.getByRole('link', { name: 'habits.form.reminderPermissionNeeded' })).toHaveAttribute('target', '_blank')
    const notice = screen.getByRole('status')
    const control = within(notice).getByRole('link')
    expect(control).toHaveAttribute('href', '/profile/notifications')
    expect(control).toHaveAccessibleDescription('habits.form.reminderSettingsDescription')
    expect(notice.textContent).toBe(control.textContent)
    expect(notice.querySelectorAll('a, button')).toHaveLength(1)
    expect(control.closest('p')).toBeNull()
  })

  it('shows the same settings path for a scheduled reminder', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    render(<ScheduledReminderSection reminderEnabled scheduledReminders={[]} onToggleReminder={vi.fn()} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} t={t} />)
    expect(screen.getByRole('switch', { name: 'habits.form.scheduledReminder' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: 'habits.form.reminderPermissionNeeded' })).toHaveAttribute('target', '_blank')
    const notice = screen.getByRole('status')
    const control = within(notice).getByRole('link')
    expect(control).toHaveAttribute('href', '/profile/notifications')
    expect(control).toHaveAccessibleDescription('habits.form.reminderSettingsDescription')
    expect(notice.textContent).toBe(control.textContent)
    expect(notice.querySelectorAll('a, button')).toHaveLength(1)
    expect(control.closest('p')).toBeNull()
  })
  it('retains one polite live region as permission changes without a second announcement node', () => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    const props = { reminderTimes: [15], onReminderTimesChange: vi.fn(), onToggleReminder: vi.fn(), reminderLabel: () => '15 min', t }
    const { rerender } = render(<ReminderSection {...props} reminderEnabled={false} />)
    const notice = screen.getByRole('status')
    expect(notice).toBeEmptyDOMElement()
    rerender(<ReminderSection {...props} reminderEnabled />)
    expect(screen.getByRole('status')).toBe(notice)
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(notice).toHaveAttribute('aria-atomic', 'true')
    expect(within(notice).getAllByRole('link')).toHaveLength(1)
    rerender(<ReminderSection {...props} reminderEnabled={false} />)
    expect(screen.getByRole('status')).toBe(notice)
    expect(screen.queryByRole('link')).toBeNull()
  })
})


describe('reminder permission notice hover geometry', () => {
  let launch: BrowserLaunch | undefined
  let browser: Browser
  let stylesheet: string
  registerChromeLaunchHook(beforeAll, async (next) => { launch = next; browser = await next })
  beforeAll(async () => {
    const source = resolve('app/globals.css')
    stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    const font = readFileSync(require.resolve('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf')).toString('base64')
    stylesheet += `@font-face { font-family: 'Geist'; src: url(data:font/ttf;base64,${font}); } :root { --font-sans: 'Geist'; font-family: 'Geist'; }`
  })
  afterAll(async () => { await closeChrome(launch) }, 30_000)

  const cases = (['en', 'pt-BR'] as const).flatMap((locale) =>
    (['dark', 'light'] as const).flatMap((mode) =>
      [412, 840, 1100].flatMap((width) =>
        (['relative', 'scheduled'] as const).map((editor) => ({ locale, mode, width, editor })),
      ),
    ),
  )

  it.each(cases)('keeps the $editor fill perceptible at $width in $locale and $mode', async ({ locale, mode, width, editor }) => {
    vi.stubGlobal('Notification', { permission: 'denied' })
    const messages = locale === 'en' ? en : ptBr
    const translate = ((key: string) => key === 'habits.form.reminderPermissionNeeded'
      ? messages.habits.form.reminderPermissionNeeded : key) as typeof t
    const { container, unmount } = render(editor === 'relative'
      ? <ReminderSection inline reminderEnabled reminderTimes={[15]} onReminderTimesChange={vi.fn()} onToggleReminder={vi.fn()} reminderLabel={() => '15 min'} t={translate} />
      : <ScheduledReminderSection inline reminderEnabled scheduledReminders={[]} onToggleReminder={vi.fn()} onSetScheduledReminders={vi.fn()} onValidationError={vi.fn()} t={translate} />)
    const page = await browser.newPage({ viewport: { width, height: 915 }, reducedMotion: 'reduce' })
    try {
      const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value};`).join('')
      await page.setContent(`<style>${stylesheet}:root{${variables}} body{background:var(--bg)}</style><div style="max-width:620px;margin:16px">${container.innerHTML}</div>`)
      await page.evaluate(() => document.fonts.ready)
      const control = page.getByRole('link', { name: messages.habits.form.reminderPermissionNeeded, exact: true })
      const resting = await control.evaluate(readNoticePaint)
      expect(resting.height).toBeGreaterThanOrEqual(48)
      await control.hover()
      await page.evaluate(() => new Promise(requestAnimationFrame))
      const hovered = await control.evaluate(readNoticePaint)
      expect(hovered.inlinePadding).toBeGreaterThanOrEqual(8)
      expect(hovered.blockPadding).toBeGreaterThanOrEqual(4)
      expect((Math.max(resting.backgroundLuminance, hovered.backgroundLuminance) + 0.05)
        / (Math.min(resting.backgroundLuminance, hovered.backgroundLuminance) + 0.05)).toBeGreaterThanOrEqual(1.25)
      expect((Math.max(hovered.textLuminance, hovered.backgroundLuminance) + 0.05)
        / (Math.min(hovered.textLuminance, hovered.backgroundLuminance) + 0.05)).toBeGreaterThanOrEqual(4.5)
    } finally {
      unmount()
      await page.close()
    }
  })
})

function readNoticePaint(element: HTMLElement | SVGElement) {
  const ancestors: Element[] = []
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor)
  let background = [255, 255, 255]
  for (const ancestor of ancestors) {
    const channels = getComputedStyle(ancestor).backgroundColor.match(/[\d.]+/g)!.map(Number)
    const alpha = channels[3] ?? 1
    background = background.map((below, index) => channels[index]! * alpha + below * (1 - alpha))
  }
  const luminance = (channels: number[]) => channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
  const style = getComputedStyle(element)
  return {
    height: element.getBoundingClientRect().height,
    inlinePadding: Math.min(Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)),
    blockPadding: Math.min(Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)),
    backgroundLuminance: luminance(background),
    textLuminance: luminance(style.color.match(/[\d.]+/g)!.map(Number).slice(0, 3)),
  }
}
