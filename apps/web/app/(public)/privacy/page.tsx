'use client'

import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'

export default function PrivacyPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <button
          type="button"
          className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors"
          onClick={() => goBackOrFallback(isAuthenticated ? '/' : '/login')}
        >
          <ArrowLeft className="size-5 text-text-primary" />
        </button>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">{t('privacy.title')}</h1>
      </header>

      <div className="space-y-4">
        <p className="text-xs text-text-muted">{t('privacy.lastUpdated')}</p>

        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.intro.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{t('privacy.intro.body')}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.dataCollected.title')}</h2>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>{t('privacy.dataCollected.account')}</li>
              <li>{t('privacy.dataCollected.habits')}</li>
              <li>{t('privacy.dataCollected.chat')}</li>
              <li>{t('privacy.dataCollected.preferences')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.howWeUse.title')}</h2>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>{t('privacy.howWeUse.provide')}</li>
              <li>{t('privacy.howWeUse.personalize')}</li>
              <li>{t('privacy.howWeUse.notifications')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.thirdParty.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-1.5">{t('privacy.thirdParty.intro')}</p>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5 list-disc list-inside">
              <li>{t('privacy.thirdParty.google')}</li>
              <li>{t('privacy.thirdParty.stripe')}</li>
              <li>{t('privacy.thirdParty.firebase')}</li>
              <li>{t('privacy.thirdParty.openai')}</li>
              <li>{t('privacy.thirdParty.resend')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.noSell.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{t('privacy.noSell.body')}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.security.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{t('privacy.security.body')}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.deletion.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed mb-1.5">{t('privacy.deletion.body')}</p>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1 list-none">
              <li>{t('privacy.deletion.step1')}</li>
              <li>{t('privacy.deletion.step2')}</li>
              <li>{t('privacy.deletion.step3')}</li>
            </ul>
            <p className="text-sm text-text-secondary leading-relaxed mt-1.5">{t('privacy.deletion.step4')}</p>
          </div>

          <div>
            <h2 className="text-sm font-bold text-text-primary mb-1.5">{t('privacy.contact.title')}</h2>
            <p className="text-sm text-text-secondary leading-relaxed">{t('privacy.contact.body')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
