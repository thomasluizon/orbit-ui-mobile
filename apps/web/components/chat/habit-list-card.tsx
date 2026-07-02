'use client'

import { useTranslations } from 'next-intl'
import type {
  HabitListCard as HabitListCardData,
  HabitListCardStatus,
} from '@orbit/shared/types/chat'

const STATUS_LABEL_KEYS: Record<HabitListCardStatus, string | null> = {
  today: 'chat.habitList.today',
  overdue: 'chat.habitList.overdue',
  general: 'chat.habitList.general',
  none: null,
}

function resolveAccent(status: HabitListCardStatus, isBadHabit: boolean): string {
  if (isBadHabit || status === 'overdue') return 'var(--status-bad)'
  if (status === 'today') return 'var(--primary)'
  return 'var(--fg-3)'
}

export function HabitListCard({ habitList }: Readonly<{ habitList: HabitListCardData }>) {
  const t = useTranslations()

  return (
    <div
      data-slot="habit-list-card"
      className="mt-2 w-full md:max-w-[65ch] overflow-hidden rounded-[16px]"
      style={{ background: 'var(--bg-elev)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      {habitList.items.length === 0 ? (
        <p className="px-3.5 py-3 text-[13px]" style={{ color: 'var(--fg-3)' }}>
          {t('chat.habitList.empty')}
        </p>
      ) : (
        habitList.items.map((item, index) => {
          const labelKey = STATUS_LABEL_KEYS[item.status]
          const accent = resolveAccent(item.status, item.isBadHabit)
          return (
            <div
              key={item.id}
              data-habit-status={item.status}
              className="flex items-center gap-2.5"
              style={{
                paddingTop: 10,
                paddingBottom: 10,
                paddingRight: 14,
                paddingLeft: 14 + item.depth * 16,
                boxShadow: index === 0 ? undefined : 'inset 0 1px 0 var(--hairline)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  textAlign: 'center',
                  fontSize: item.emoji ? 15 : 8,
                  color: item.emoji ? undefined : accent,
                }}
              >
                {item.emoji ?? '●'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: 'var(--fg-1)' }}>
                {item.title}
              </span>
              {labelKey && (
                <span
                  className="shrink-0 rounded-full text-[10px] font-semibold uppercase"
                  style={{
                    padding: '2px 8px',
                    letterSpacing: '0.04em',
                    color: accent,
                    background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                  }}
                >
                  {t(labelKey)}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
