'use client'

import { useTranslations } from 'next-intl'
import type { Time24 } from '@orbit/shared/contracts/forms'
import { Chip } from '@/components/ui/chip'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Proposed } from '@/components/ui/proposed'
import { TimeField } from '@/components/ui/time-field'
import { AstraGlyph } from '@/components/ui/astra-glyph'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

interface OnboardingCreateHabitProps {
  emoji: string
  days: string[]
  dueTime: string
  proposed: boolean
  correcting: boolean
  atLimit: boolean
  allowance: number
  onCorrect: () => void
  onEmojiChange: (value: string) => void
  onToggleDay: (day: string) => void
  onTimeChange: (value: string) => void
}

export function OnboardingCreateHabit(props: Readonly<OnboardingCreateHabitProps>) {
  const t = useTranslations('onboarding.flow')
  const controls = (
    <div className="flex flex-col gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      <label className="flex flex-col gap-2 text-sm font-medium text-[var(--fg-2)]">
        {t('when.emojiLabel')}
        <input className="min-h-[54px] w-20 rounded-[12px] bg-[var(--bg-field)] px-4 text-2xl shadow-[inset_0_0_0_1px_var(--border-control)]" value={props.emoji} maxLength={4} onChange={(event) => props.onEmojiChange(event.target.value)} />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--fg-2)]">{t('when.daysLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => <Chip key={day} active={props.days.includes(day)} onClick={() => props.onToggleDay(day)}>{t(`when.days.${day.toLowerCase()}`)}</Chip>)}
        </div>
      </div>
      <TimeField label={t('when.timeLabel')} value={props.dueTime as Time24 | ''} onChange={props.onTimeChange} onClear={() => props.onTimeChange('')} hint={t('when.timeHint')} />
    </div>
  )
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start gap-3">{props.proposed ? <span className="grid h-[26px] w-5 shrink-0 place-items-center text-[var(--fg-3)]"><AstraGlyph size={18} color="currentColor" /></span> : null}<h1 id="onboarding-title" className="m-0 min-w-0 flex-1 text-pretty text-[17px] font-normal leading-[1.5] text-[var(--fg-1)]">{props.proposed ? t('when.astraRead') : t('when.direct')}</h1></div>
      {props.atLimit ? <CapacityNotice message={t('when.limit', { allowance: props.allowance })} /> : null}
      {props.proposed && !props.correcting ? (
        <button type="button" className="w-full text-left" onClick={props.onCorrect}>
          <Proposed proposed scope="block" label={t('when.proposedBy')}>
            <div className="flex items-center gap-4 rounded-[20px] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"><span className="text-3xl">{props.emoji}</span><span>{props.days.map((day) => t(`when.days.${day.toLowerCase()}`)).join(', ')}{props.dueTime ? ` · ${props.dueTime}` : ''}</span></div>
          </Proposed>
        </button>
      ) : controls}
    </section>
  )
}
