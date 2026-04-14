'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  MessageSquareText,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { FeatureGuideDrawer } from '@/components/onboarding/feature-guide-drawer'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

export default function AboutPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const [showGuide, setShowGuide] = useState(false)
  const [showReferral, setShowReferral] = useState(false)

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <button
          type="button"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
          onClick={() => goBackOrFallback('/profile')}
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">{t('about.title')}</h1>
      </header>

      <div className="space-y-4">
        {/* Feature Guide */}
        <button
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
          onClick={() => setShowGuide(true)}
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <BookOpen className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('onboarding.featureGuide.openButton')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.featureGuideHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </button>

        {/* Referral */}
        <ReferralCard onOpen={() => setShowReferral(true)} />

        {/* Support link */}
        <Link
          href="/support"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <MessageSquareText className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.support.title')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.support.hint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>

        {/* Privacy Policy link */}
        <Link
          href="/privacy"
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group shadow-[var(--shadow-sm)]"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('privacy.title')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('privacy.hint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </Link>
      </div>

      {/* Drawers */}
      <ReferralDrawer open={showReferral} onOpenChange={setShowReferral} />
      <FeatureGuideDrawer open={showGuide} onOpenChange={setShowGuide} />
    </div>
  )
}
