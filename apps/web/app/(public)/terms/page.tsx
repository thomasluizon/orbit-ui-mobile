'use client'

import { useTranslations } from 'next-intl'
import { LegalDocumentLayout, type LegalDocumentSection } from '@/components/legal-document-layout'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

function useTermsSections(): LegalDocumentSection[] {
  const t = useTranslations()
  return [
    { id: 'intro', title: t('terms.intro.title'), paragraphs: [t('terms.intro.body')] },
    { id: 'provider', title: t('terms.provider.title'), paragraphs: [t('terms.provider.body')] },
    { id: 'eligibility', title: t('terms.eligibility.title'), paragraphs: [t('terms.eligibility.body')] },
    { id: 'license', title: t('terms.license.title'), paragraphs: [t('terms.license.body')] },
    { id: 'subscription', title: t('terms.subscription.title'), paragraphs: [
      t('terms.subscription.intro'), t('terms.subscription.autoRenew'),
      t('terms.subscription.cancel'), t('terms.subscription.refunds'),
    ] },
    { id: 'ai', title: t('terms.ai.title'), paragraphs: [t('terms.ai.body')] },
    { id: 'no-medical-advice', title: t('terms.noMedicalAdvice.title'), paragraphs: [t('terms.noMedicalAdvice.body')] },
    { id: 'warranty', title: t('terms.warranty.title'), paragraphs: [t('terms.warranty.body')] },
    { id: 'liability', title: t('terms.liability.title'), paragraphs: [t('terms.liability.body')] },
    { id: 'termination', title: t('terms.termination.title'), paragraphs: [t('terms.termination.body')] },
    { id: 'governing-law', title: t('terms.governingLaw.title'), paragraphs: [t('terms.governingLaw.body')] },
    { id: 'changes', title: t('terms.changes.title'), paragraphs: [t('terms.changes.body')] },
  ]
}

export default function TermsPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <LegalDocumentLayout
      title={t('terms.title')}
      lastUpdated={t('terms.lastUpdated')}
      sections={useTermsSections()}
      closingNote={{ id: 'contact', title: t('terms.contact.title'), paragraphs: [t('terms.contact.body')] }}
      backLabel={t('terms.close')}
      onBack={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
    />
  )
}
