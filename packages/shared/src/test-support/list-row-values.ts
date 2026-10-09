import type { ListRowProps } from '../contracts/lists'
import { createMockHabit, createMockProfile } from '../__tests__/factories'
import { computeHabitFrequencyLabel } from '../utils/habit-card-helpers'
import { createTimeDisplay } from '../utils/locale-format'
import { formatAccountRowValue } from '../chat/account-rows-core'
import { buildClockFormatOptions } from '../utils/preferences-options'
import { deriveProfilePreferenceValues } from '../utils/profile-preferences'

interface ValueCase {
  surface: string
  props: ListRowProps
  statusRing?: boolean
  truncatesValue?: boolean
}

type Translate = (key: string, values?: Record<string, string | number | Date>) => string

export function listRowValueCases(locale: string, t: Translate): ValueCase[] {
  const profile = createMockProfile({ language: locale === 'pt-BR' ? 'pt-BR' : 'en' })
  const habit = createMockHabit({ dueTime: '08:00' })
  const preferences = deriveProfilePreferenceValues({ profile, selectedLanguage: locale, translate: t })
  const time = createTimeDisplay(locale, profile.uses24HourClock).displayTime(habit.dueTime)
  const schedule = computeHabitFrequencyLabel(createMockHabit({ days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] }), t)
  const selected = t('habits.form.selectedCount', { count: 3 })
  const open = () => {}
  return [
    { surface: 'profile timezone', props: { title: t('profile.settingsRows.timezone'), value: profile.timeZone!, compact: true, chevron: false } },
    { surface: 'profile week start', props: { title: t('profile.settingsRows.weekStart'), value: preferences.weekStartLabel, compact: true, chevron: false } },
    { surface: 'profile clock', props: { title: t('settings.clock.title'), value: buildClockFormatOptions(t)[0]!.label, compact: true, chevron: false } },
    { surface: 'profile language', props: { title: t('profile.language.title'), value: locale === 'pt-BR' ? t('profile.language.brazilianPortuguese') : preferences.languageLabel, compact: true, chevron: false } },
    { surface: 'profile export', props: { title: t('profile.settingsRows.export'), value: t('dataExport.preparing'), icon: 'download', compact: true, chevron: false } },
    { surface: 'calendar agenda', props: { title: habit.title, value: time, compact: true, wrapTitle: true, readOnly: true } },
    { surface: 'calendar day detail', props: { title: habit.title, value: `${time} · ${t('calendar.status.completed')}`, compact: true, readOnly: true, chevron: false }, statusRing: true },
    { surface: 'Astra account email', props: { title: t('chat.account.row.email'), value: formatAccountRowValue({ key: 'email', value: profile.email, valueType: 'text' }, locale, t), wrapValue: true, readOnly: true, chevron: false } },
    { surface: 'Astra long account email', props: { title: t('chat.account.row.email'), value: formatAccountRowValue({ key: 'email', value: `${'account'.repeat(12)}@example.com`, valueType: 'text' }, locale, t), wrapValue: true, readOnly: true, chevron: false } },
    { surface: 'goal linked habit', props: { title: habit.title, value: t('goals.detail.linkedHabitStreak', { count: 3 }), compact: false } },
    { surface: 'habit goal picker', props: { title: t('habits.form.goals'), value: selected, placement: 'column' } },
    { surface: 'habit schedule', props: { title: t('habits.detail.schedule'), value: computeHabitFrequencyLabel(habit, t)!, placement: 'column' } },
    { surface: 'habit long schedule', props: { title: t('habits.detail.schedule'), value: schedule!, placement: 'column' }, truncatesValue: true },
    { surface: 'habit slip alert', props: { title: t('habits.detail.slipAlert'), description: t('habits.detail.slipAlertDescription'), value: t('habits.detail.proGate') } },
    { surface: 'habit linked goals', props: { title: t('habits.detail.linkedGoals'), value: t('habits.detail.noValue') } },
    { surface: 'habit tag picker', props: { title: t('habits.form.tags'), value: selected, placement: 'column' } },
    { surface: 'habit form Pro', props: { title: t('common.upgrade'), value: t('common.proBadge'), placement: 'column' } },
    { surface: 'API key prefix', props: { title: habit.title, value: 'orbit_sk_…', icon: 'key', compact: true, wrapTitle: true, chevron: false, action: { icon: 'trash', label: t('common.delete'), onPress: open, danger: true } } },
    { surface: 'API key gate', props: { title: t('profile.apiKeys.open'), value: t('profile.apiKeys.noKeys'), icon: 'key', compact: true, wrapTitle: true, wrapValue: true } },
    { surface: 'referral completed', props: { title: t('referral.drawer.completed'), value: '3 / 5', readOnly: true } },
    { surface: 'referral pending', props: { title: t('referral.drawer.pending'), value: String(3), readOnly: true } },
    { surface: 'referral coupons', props: { title: t('referral.drawer.couponsEarned'), value: String(3), readOnly: true } },
  ]
}
