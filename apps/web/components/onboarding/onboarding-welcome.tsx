'use client'

import { useTranslations } from 'next-intl'
import type { HabitPhraseToken } from '@orbit/shared/utils'
import { ONBOARDING_STARTERS } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { QuietLink } from '@/components/ui/quiet-link'

interface OnboardingWelcomeProps {
  sentence: string
  marks: readonly HabitPhraseToken[]
  onChange: (value: string) => void
  onHaveAccount?: () => void
}

export function OnboardingWelcome({ sentence, marks, onChange, onHaveAccount }: Readonly<OnboardingWelcomeProps>) {
  const t = useTranslations('onboarding.flow')
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <OrbitMark size={40} />
        <h1 id="onboarding-title" className="m-0 text-pretty font-display text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-[var(--fg-1)] lg:text-[34px] lg:leading-[1.12]">{t('what.title')}</h1>
      </div>
      <Input label={t('what.label')} value={sentence} onChange={onChange} placeholder={t('what.placeholder')} maxLength={100} multiline rows={3} marks={marks} marksLabel={t('what.marksLabel')} autoFocus />
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-[var(--fg-3)]">{t('what.startersTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {ONBOARDING_STARTERS.map((key) => (
            <Chip key={key} active={sentence === t(`what.starters.${key}`)} onClick={() => onChange(t(`what.starters.${key}`))}>{t(`what.starters.${key}`)}</Chip>
          ))}
        </div>
      </div>
      {onHaveAccount ? <div className="flex justify-center"><QuietLink onClick={onHaveAccount}>{t('what.haveAccount')}</QuietLink></div> : null}
    </section>
  )
}
