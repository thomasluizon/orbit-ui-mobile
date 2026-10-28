import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { UsageCard } from '@/components/upgrade/usage-card'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { AstraAllowancePanel } from '@/components/profile/astra-allowance-panel'
import { createTokensV2 } from '@/lib/theme'
import { i18n } from '@/lib/i18n'

vi.unmock('react-i18next')
const TestRenderer = require('react-test-renderer')
const tokens = createTokensV2('orange', 'dark')
afterEach(async () => { await i18n.changeLanguage('en') })

function surfaceText(profile: ReturnType<typeof createMockProfile>, locale: string) {
  let tree!: ReturnType<typeof TestRenderer.create>
  TestRenderer.act(() => { tree = TestRenderer.create(<>
    <UsageCard profile={profile} usagePercent={80} locale={locale} t={i18n.t} tokens={tokens} />
    <AstraAllowancePanel profile={profile} onPlanAction={() => {}} />
    <ProPitch profile={profile} trialDaysLeft={5} t={i18n.t} tokens={tokens} />
  </>) })
  const text = JSON.stringify(tree.toJSON())
  TestRenderer.act(() => tree.unmount())
  return text
}

describe('weekly Astra allowance surfaces', () => {
  it.each(['en', 'pt-BR'])('shows the count and server reset in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    const profile = createMockProfile({ hasProAccess: true, aiMessagesUsed: 200, aiMessagesLimit: 250,
      aiMessagesPeriod: 'week', aiMessagesResetsAt: '2026-11-09T02:00:00Z', timeZone: 'America/Sao_Paulo' })
    const text = surfaceText(profile, locale)
    expect(text).toContain(locale === 'en' ? '200 of 250' : '200 de 250')
    expect(text.split(locale === 'en' ? 'Resets Sunday.' : 'Próxima renovação: domingo.')).toHaveLength(4)
    expect(text).toContain(locale === 'en' ? "This week's messages" : 'Mensagens da semana')
    expect(text).toContain(locale === 'en' ? 'messages/week' : 'por semana')
  })

  it.each([false, true])('keeps daily usage for a legacy profile, Pro=%s', (hasProAccess) => {
    const text = surfaceText(createMockProfile({ hasProAccess, isTrialActive: false, aiMessagesUsed: 2, aiMessagesLimit: hasProAccess ? 50 : 5 }), 'en')
    expect(text).toContain("Today's messages")
    expect(text).not.toContain('Resets ')
  })
})
