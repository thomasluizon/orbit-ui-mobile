'use client'

import { MessageSquare, CalendarDays, Trophy, BellRing } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface FeatureItem {
  Icon: LucideIcon
  titleKey: string
  descKey: string
}

const features: FeatureItem[] = [
  { Icon: MessageSquare, titleKey: 'onboarding.flow.features.chat.title', descKey: 'onboarding.flow.features.chat.desc' },
  { Icon: CalendarDays, titleKey: 'onboarding.flow.features.calendar.title', descKey: 'onboarding.flow.features.calendar.desc' },
  { Icon: Trophy, titleKey: 'onboarding.flow.features.achievements.title', descKey: 'onboarding.flow.features.achievements.desc' },
  { Icon: BellRing, titleKey: 'onboarding.flow.features.notifications.title', descKey: 'onboarding.flow.features.notifications.desc' },
]

export function OnboardingFeatures() {
  const t = useTranslations()

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary text-center mb-2">
        {t('onboarding.flow.features.title')}
      </h1>
      <p className="text-sm text-text-secondary text-center mb-6">
        {t('onboarding.flow.features.subtitle')}
      </p>

      {/* Feature cards */}
      <div className="flex flex-col gap-3">
        {features.map((feature, i) => (
          <div
            key={feature.titleKey}
            className="flex items-start gap-4 p-4 rounded-[var(--radius-xl)] bg-surface border border-border hover:border-border-emphasis hover:bg-surface-elevated/50 transition-all duration-200"
            style={{
              animation: `slide-up-fade 400ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`,
            }}
          >
            <div className="size-10 rounded-[var(--radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
              <feature.Icon className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{t(feature.titleKey)}</p>
              <p className="text-xs text-text-secondary leading-relaxed mt-0.5">{t(feature.descKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
