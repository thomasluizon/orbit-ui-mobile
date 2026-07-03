import type { Achievement } from '@orbit/shared/types/gamification'
import { achievementEmoji } from '@orbit/shared/utils'
import { SectionLabel } from '@/components/ui/section-label'

type AchievementCategoryView = {
  key: string
  items: Achievement[]
}

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string
type DisplayDateFn = (value: string | Date, options?: Intl.DateTimeFormatOptions) => string

interface AchievementCategorySectionProps {
  category: AchievementCategoryView
  t: TranslationFn
  displayDate: DisplayDateFn
}

export function AchievementCategorySection({
  category,
  t,
  displayDate,
}: Readonly<AchievementCategorySectionProps>) {
  return (
    <>
      <SectionLabel>
        {t(`gamification.categories.${category.key}`)}
      </SectionLabel>
      <div className="stagger-enter grid grid-cols-2 gap-3 px-5 md:[grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
        {category.items.map((achievement) => (
          <AchievementTile
            key={achievement.id}
            achievement={achievement}
            t={t}
            displayDate={displayDate}
          />
        ))}
      </div>
    </>
  )
}

interface AchievementTileProps {
  achievement: Achievement
  t: TranslationFn
  displayDate: DisplayDateFn
}

function AchievementTile({ achievement, t, displayDate }: Readonly<AchievementTileProps>) {
  const earned = achievement.isEarned
  const name = t(`gamification.achievements.${achievement.id}.name`)
  const description = t(`gamification.achievements.${achievement.id}.description`)

  return (
    <div
      data-testid={`achievement-${achievement.id}`}
      className="flex flex-col items-center text-center"
      style={{
        minHeight: 156,
        padding: '18px 12px 14px',
        borderRadius: 16,
        background: 'var(--bg-card)',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
        opacity: earned ? 1 : 0.45,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: 30,
          lineHeight: 1,
          marginBottom: 8,
          filter: earned ? 'none' : 'grayscale(1)',
        }}
      >
        {achievementEmoji(achievement.iconKey)}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          color: earned ? 'var(--fg-1)' : 'var(--fg-2)',
          marginBottom: 4,
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 11,
          lineHeight: 1.35,
          color: 'var(--fg-3)',
        }}
      >
        {description}
      </span>
      {earned && achievement.earnedAtUtc && (
        <span
          style={{
            marginTop: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--fg-4)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t('gamification.tile.earned', {
            date: displayDate(achievement.earnedAtUtc, { month: 'short', day: 'numeric' }),
          })}
        </span>
      )}
    </div>
  )
}
