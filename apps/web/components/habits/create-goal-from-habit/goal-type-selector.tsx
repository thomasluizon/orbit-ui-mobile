'use client'

import { Target, Flame } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { GoalType } from '@orbit/shared/types/goal'
import { GoalGroupLabel } from '../../goals/goal-group-label'
import { RadioGroup, useRadioGroupItem } from '@/components/ui/radio-row'

const goalTypeOptions = [
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

function GoalTypeOption({
  active,
  label,
  onSelect,
  option,
}: Readonly<{
  active: boolean
  label: string
  onSelect: () => void
  option: (typeof goalTypeOptions)[number]
}>) {
  const { elementRef, onActivate, onKeyDown, tabIndex } = useRadioGroupItem({ disabled: false, onSelect, selected: active })
  const Icon = option.icon

  return (
    <button
      ref={elementRef}
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className="flex flex-1 cursor-pointer appearance-none items-center justify-center transition-[background-color,color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
      style={{
        gap: 8,
        minHeight: 48,
        borderRadius: 16,
        border: 0,
        background: active ? 'var(--primary)' : 'var(--bg-elev)',
        boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--hairline)',
        fontFamily: 'var(--font-sans)',
        fontSize: 15,
        fontWeight: 500,
        color: active ? 'var(--fg-on-primary)' : 'var(--fg-2)',
      }}
    >
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      {label}
    </button>
  )
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
      <RadioGroup
        className="flex"
        aria-label={t('goals.form.type')}
        style={{ gap: 12 }}
      >
        {goalTypeOptions.map((option) => {
          const isActive = goalType === option.key
          return (
            <GoalTypeOption
              key={option.key}
              active={isActive}
              label={t(option.titleKey)}
              onSelect={() => onTypeChange(option.key)}
              option={option}
            />
          )
        })}
      </RadioGroup>
      <div style={{ padding: '12px 0' }}>
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
        {'hintKey' in activeTypeOption && (
          <div
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
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
