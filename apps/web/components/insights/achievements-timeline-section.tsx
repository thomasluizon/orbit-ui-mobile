'use client'

import { useTranslations, useLocale } from 'next-intl'
import { ChartRing } from '@/components/charts/chart-ring'
import { useGamificationProfile } from '@/hooks/use-gamification'
import { InsightsSection, toSectionStatus } from './insights-section'

const MAX_TIMELINE_ITEMS = 8

/** Lifetime achievement-progress ring plus the most recently earned badges. */
export function AchievementsTimelineSection({
  divider,
  className,
}: Readonly<{ divider?: boolean; className?: string }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile, earnedAchievements, isLoading, isError, refetch } = useGamificationProfile()

  const recent = [...earnedAchievements]
    .sort((a, b) => (b.earnedAtUtc ?? '').localeCompare(a.earnedAtUtc ?? ''))
    .slice(0, MAX_TIMELINE_ITEMS)

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const title = t('insights.sections.achievementsTimeline')

  return (
    <InsightsSection
      title={title}
      description={t('insights.sections.achievementsTimelineDesc')}
      divider={divider}
      className={className}
      status={toSectionStatus({ isLoading, isError, isEmpty: recent.length === 0 })}
      onRetry={() => void refetch()}
    >
      <div className="flex items-start gap-6">
        {profile ? (
          <ChartRing
            value={profile.achievementsEarned}
            max={profile.achievementsTotal}
            label={t('insights.sections.achievementsOf', { total: profile.achievementsTotal })}
            size={104}
            ariaLabel={title}
          />
        ) : null}
        <ol className="flex min-w-0 flex-1 flex-col gap-3">
          {recent.map((achievement) => (
            <li
              key={achievement.id}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="t-row truncate">
                {t(`gamification.achievements.${achievement.id}.name`)}
              </span>
              <span className="t-meta shrink-0">
                {achievement.earnedAtUtc
                  ? dateFormatter.format(new Date(achievement.earnedAtUtc))
                  : ''}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </InsightsSection>
  )
}
