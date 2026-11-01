import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { HabitScheduleFields } from '@/components/habits/habit-form-fields/habit-schedule-fields'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'

export function RadioOptionFixture({ locale }: Readonly<{ locale: 'en' | 'pt-BR' }>) {
  const messages = locale === 'en' ? en : ptBR
  const words = messages.habits.form
  return <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
    <main style={{ padding: 16 }}>
      <RadioGroup aria-label={words.itemType}>
        <RadioRow label={words.typeTask} wrapLabel />
        <RadioRow label={words.typeHabit} wrapLabel selected />
      </RadioGroup>
      <HabitScheduleFields unit="Day" quantity={1} flexible disabled={false} onChange={() => {}} onModeChange={() => {}} />
    </main>
  </NextIntlClientProvider>
}
