'use client'

import {
  Orbit,
  ListTree,
  CalendarDays,
  Trophy,
  BellRing,
  type LucideIcon,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'

interface FeatureRow {
  Icon: LucideIcon
  titleKey: string
  descKey: string
}

const FEATURE_ROWS: FeatureRow[] = [
  { Icon: Orbit, titleKey: 'onboarding.flow.features.chat.title', descKey: 'onboarding.flow.features.chat.desc' },
  { Icon: ListTree, titleKey: 'onboarding.flow.features.subHabits.title', descKey: 'onboarding.flow.features.subHabits.desc' },
  { Icon: CalendarDays, titleKey: 'onboarding.flow.features.calendar.title', descKey: 'onboarding.flow.features.calendar.desc' },
  { Icon: Trophy, titleKey: 'onboarding.flow.features.achievements.title', descKey: 'onboarding.flow.features.achievements.desc' },
  { Icon: BellRing, titleKey: 'onboarding.flow.features.notifications.title', descKey: 'onboarding.flow.features.notifications.desc' },
]

export function OnboardingFeatures() {
  const t = useTranslations()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
      <div className="t-h2 text-center text-balance">
        {t('onboarding.flow.features.title')}
      </div>
      <div
        className="stagger-enter"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {FEATURE_ROWS.map(({ Icon, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="flex items-start"
            style={{ gap: 12 }}
          >
            <span
              className="inline-flex shrink-0 justify-center"
              style={{ width: 24 }}
            >
              <Icon size={22} strokeWidth={1.8} color="var(--fg-2)" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
              <div className="t-body font-medium">{t(titleKey)}</div>
              <div className="t-secondary">{t(descKey)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
