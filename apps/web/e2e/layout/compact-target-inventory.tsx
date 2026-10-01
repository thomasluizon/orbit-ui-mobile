import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import ptBr from '@orbit/shared/i18n/pt-BR.json'
import { StreakBadge } from '@/components/gamification/streak-badge'
import { HabitChecklist } from '@/components/habits/habit-checklist'

const router: AppRouterInstance = {
  back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {},
  bfcacheId: 'press-target',
}

process.stdout.write(renderToStaticMarkup(
  <AppRouterContext.Provider value={router}>
    <NextIntlClientProvider locale="pt-BR" messages={ptBr} timeZone="UTC">
      <StreakBadge streak={3} />
      <HabitChecklist items={[{ text: 'Beber água', isChecked: true }]} interactive onReset={() => {}} onClear={() => {}} />
    </NextIntlClientProvider>
  </AppRouterContext.Provider>,
))
