'use client'

import { useTranslations } from 'next-intl'
import { LegalDocumentLayout, type LegalDocumentSection } from '@/components/legal-document-layout'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

function usePrivacySections(): LegalDocumentSection[] {
  const t = useTranslations()
  return [
    { id: 'intro', title: t('privacy.intro.title'), paragraphs: [t('privacy.intro.body')] },
    { id: 'controller', title: t('privacy.controller.title'), paragraphs: [t('privacy.controller.body')] },
    { id: 'data-collected', title: t('privacy.dataCollected.title'), paragraphs: [
      t('privacy.dataCollected.account'), t('privacy.dataCollected.habits'),
      t('privacy.dataCollected.chat'), t('privacy.dataCollected.preferences'),
      t('privacy.dataCollected.device'),
    ] },
    { id: 'how-we-use', title: t('privacy.howWeUse.title'), paragraphs: [
      t('privacy.howWeUse.provide'), t('privacy.howWeUse.personalize'),
      t('privacy.howWeUse.notifications'),
    ] },
    { id: 'third-party', title: t('privacy.thirdParty.title'), paragraphs: [
      t('privacy.thirdParty.intro'), t('privacy.thirdParty.google'),
      t('privacy.thirdParty.stripe'), t('privacy.thirdParty.firebase'),
      t('privacy.thirdParty.openai'), t('privacy.thirdParty.resend'),
      t('privacy.thirdParty.googlePlay'), t('privacy.thirdParty.admob'),
      t('privacy.thirdParty.sentry'), t('privacy.thirdParty.posthog'),
      t('privacy.thirdParty.vercel'),
    ] },
    { id: 'retention', title: t('privacy.retention.title'), paragraphs: [
      t('privacy.retention.intro'), t('privacy.retention.account'),
      t('privacy.retention.sessions'), t('privacy.retention.ai'),
      t('privacy.retention.reminderHistory'), t('privacy.retention.syncRecords'),
      t('privacy.retention.calendarSuggestions'), t('privacy.retention.billingRecords'),
      t('privacy.retention.afterDeletion'),
    ] },
    { id: 'google-scopes', title: t('privacy.googleScopes.title'), paragraphs: [
      t('privacy.googleScopes.intro'), t('privacy.googleScopes.auth'),
      t('privacy.googleScopes.calendar'), t('privacy.googleScopes.control'),
    ] },
    { id: 'data-residency', title: t('privacy.dataResidency.title'), paragraphs: [t('privacy.dataResidency.body')] },
    { id: 'automated-processing', title: t('privacy.automatedProcessing.title'), paragraphs: [t('privacy.automatedProcessing.body')] },
    { id: 'minors', title: t('privacy.minors.title'), paragraphs: [t('privacy.minors.body')] },
    { id: 'export', title: t('privacy.export.title'), paragraphs: [t('privacy.export.body')] },
    { id: 'no-sell', title: t('privacy.noSell.title'), paragraphs: [t('privacy.noSell.body')] },
    { id: 'security', title: t('privacy.security.title'), paragraphs: [t('privacy.security.body')] },
    { id: 'deletion', title: t('privacy.deletion.title'), paragraphs: [
      t('privacy.deletion.body'), t('privacy.deletion.step1'),
      t('privacy.deletion.step2'), t('privacy.deletion.step3'),
      t('privacy.deletion.step4'),
    ] },
  ]
}

export default function PrivacyPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <LegalDocumentLayout
      title={t('privacy.title')}
      lastUpdated={t('privacy.lastUpdated')}
      sections={usePrivacySections()}
      closingNote={{ id: 'contact', title: t('privacy.contact.title'), paragraphs: [t('privacy.contact.body')] }}
      backLabel={t('privacy.close')}
      onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
    />
  )
}
