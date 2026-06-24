'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatGoalMetricsDate } from '@orbit/shared/utils'
import type { GoalListCard as GoalListCardData, GoalListCardItem } from '@orbit/shared/types/chat'

function resolvePercentage(item: GoalListCardItem): number {
  if (item.target <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((item.current / item.target) * 100)))
}

export function GoalListCard({ goalList }: Readonly<{ goalList: GoalListCardData }>) {
  const t = useTranslations()
  const locale = useLocale()

  return (
    <div
      data-slot="goal-list-card"
      className="mt-2 w-full overflow-hidden rounded-[16px]"
      style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      {goalList.items.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--fg-3)' }}>
          {t('chat.goalList.empty')}
        </p>
      ) : (
        goalList.items.map((item, index) => {
          const percentage = resolvePercentage(item)
          return (
            <div
              key={item.id}
              data-goal-item={item.id}
              className="flex flex-col gap-1.5"
              style={{
                padding: '10px 14px',
                boxShadow: index === 0 ? undefined : 'inset 0 1px 0 var(--hairline)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="min-w-0 flex-1 truncate text-[13px]"
                  style={{ color: 'var(--fg-1)' }}
                >
                  {item.title}
                </span>
                <span
                  className="shrink-0 text-[11px] font-semibold"
                  style={{ color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {t('chat.goalList.percentage', { pct: percentage })}
                </span>
              </div>

              <div
                aria-hidden="true"
                className="w-full overflow-hidden rounded-full"
                style={{ height: 4, background: 'var(--hairline)' }}
              >
                <div
                  style={{
                    width: `${percentage}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'var(--primary)',
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="min-w-0 flex-1 truncate text-[11px]"
                  style={{ color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {t('chat.goalList.progress', {
                    current: item.current,
                    target: item.target,
                    unit: item.unit,
                  })}
                </span>
                {item.deadline && (
                  <span className="shrink-0 text-[11px]" style={{ color: 'var(--fg-3)' }}>
                    {t('chat.goalList.deadline', {
                      date: formatGoalMetricsDate(item.deadline, locale),
                    })}
                  </span>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
