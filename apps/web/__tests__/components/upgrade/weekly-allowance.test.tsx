import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider, useTranslations } from 'next-intl'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import type { Profile } from '@orbit/shared/types'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { UsageStats } from '@/components/upgrade/usage-stats'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'

function Surfaces({ profile, locale }: { profile: Profile; locale: string }) {
  const t = useTranslations()
  return <><UsageStats profile={profile} usagePercent={80} locale={locale} t={t} />
    <AstraAllowancePanel profile={profile} />
    <ProPitch profile={profile} trialDaysLeft={5} t={t} /></>
}

describe('weekly Astra allowance surfaces', () => {
  it.each(['en', 'pt-BR'])('shows the count and server reset in %s', (locale) => {
    const profile = createMockProfile({ hasProAccess: true, aiMessagesUsed: 200, aiMessagesLimit: 250,
      aiMessagesPeriod: 'week', aiMessagesResetsAt: '2026-11-09T02:00:00Z', timeZone: 'America/Sao_Paulo' })
    render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}>
      <Surfaces profile={profile} locale={locale} />
    </NextIntlClientProvider>)
    expect(screen.getByText(locale === 'en' ? '200 of 250' : '200 de 250')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: locale === 'en' ? 'Astra allowance' : 'Cota da Astra' })).toBeInTheDocument()
    expect(screen.getAllByText(locale === 'en' ? 'Resets Sunday.' : 'Próxima renovação: domingo.')).toHaveLength(3)
    expect(screen.getByText(locale === 'en' ? "This week's messages" : 'Mensagens da semana')).toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? 'messages/week' : 'por semana')).toBeInTheDocument()
  })

  it.each([false, true])('keeps daily usage for a legacy profile, Pro=%s', (hasProAccess) => {
    const profile = createMockProfile({ hasProAccess, isTrialActive: false, aiMessagesUsed: 2, aiMessagesLimit: hasProAccess ? 50 : 5 })
    render(<NextIntlClientProvider locale="en" messages={en}><Surfaces profile={profile} locale="en" /></NextIntlClientProvider>)
    expect(screen.getByText("Today's messages")).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByText(/^Resets /)).toBeNull()
  })
})
