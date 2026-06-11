'use client'

import {
  Orbit,
  ListTree,
  CalendarDays,
  Trophy,
  BellRing,
  type LucideIcon,
} from 'lucide-react'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0' }}>
      <div
        className="text-center"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: 'var(--fg-1)',
          marginBottom: 14,
        }}
      >
        {t('onboarding.flow.features.title')}
      </div>
      {FEATURE_ROWS.map(({ Icon, titleKey, descKey }) => (
        <div
          key={titleKey}
          className="flex items-start"
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--hairline)',
            gap: 14,
          }}
        >
          <span
            className="inline-flex shrink-0 justify-center"
            style={{ width: 26, paddingTop: 1 }}
          >
            <Icon size={22} strokeWidth={1.8} color="var(--fg-2)" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {t(titleKey)}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13.5,
                color: 'var(--fg-3)',
                lineHeight: 1.4,
                marginTop: 3,
              }}
            >
              {t(descKey)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
