'use client'

import { Target, Flame } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { GoalType } from '@orbit/shared/types/goal'
import { GoalGroupLabel } from './goal-group-label'

export const goalTypeOptions = [
  {
    key: 'Standard',
    titleKey: 'goals.form.typeStandard',
    descKey: 'goals.form.typeStandardDescription',
    icon: Target,
  },
  {
    key: 'Streak',
    titleKey: 'goals.form.typeStreak',
    descKey: 'goals.form.typeStreakHintGood',
    hintKey: 'goals.form.typeStreakHintBad',
    icon: Flame,
  },
] as const

interface GoalTypeSelectorProps {
  goalType: GoalType
  onTypeChange: (type: GoalType) => void
}

export function GoalTypeSelector({
  goalType,
  onTypeChange,
}: Readonly<GoalTypeSelectorProps>) {
  const t = useTranslations()
  const activeTypeOption =
    goalTypeOptions.find((option) => option.key === goalType) ?? goalTypeOptions[0]

  return (
    <>
      <GoalGroupLabel>{t('goals.form.type')}</GoalGroupLabel>
      <div
        className="flex"
        role="radiogroup"
        aria-label={t('goals.form.type')}
        style={{ gap: 10 }}
      >
        {goalTypeOptions.map((option) => {
          const isActive = goalType === option.key
          const Icon = option.icon
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onTypeChange(option.key as GoalType)}
              className="flex flex-1 cursor-pointer appearance-none items-center justify-center transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
              style={{
                gap: 8,
                minHeight: 46,
                borderRadius: 14,
                border: 0,
                background: isActive ? 'var(--primary)' : 'var(--bg-elev)',
                boxShadow: isActive ? 'none' : 'inset 0 0 0 1px var(--hairline)',
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                fontWeight: 500,
                color: isActive ? 'var(--fg-on-primary)' : 'var(--fg-2)',
              }}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
              {t(option.titleKey)}
            </button>
          )
        })}
      </div>
      <div style={{ padding: '10px 0 12px' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--fg-3)',
            lineHeight: 1.5,
          }}
        >
          {t(activeTypeOption.descKey)}
        </div>
        {'hintKey' in activeTypeOption && activeTypeOption.hintKey && (
          <div
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              color: 'var(--fg-3)',
              lineHeight: 1.4,
            }}
          >
            {t(activeTypeOption.hintKey)}
          </div>
        )}
      </div>
    </>
  )
}
