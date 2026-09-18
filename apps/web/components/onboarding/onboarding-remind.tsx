'use client'

import { useTranslations } from 'next-intl'
import { getOnboardingReminderPreviewTime } from '@orbit/shared/utils'
import { OrbitMark } from '@/components/ui/orbit-mark'

export type ReminderState = 'ask' | 'denied' | 'refused' | 'unsupported' | 'failed' | 'no-time' | 'no-day'

interface OnboardingRemindProps {
  state: ReminderState
  title: string
  dueTime: string
}

export function OnboardingRemind({ state, title, dueTime }: Readonly<OnboardingRemindProps>) {
  const t = useTranslations('onboarding.flow.remind')
  const previewTime = getOnboardingReminderPreviewTime(dueTime)
  if (state === 'no-time') return <Message title={t('noTimeTitle')} body={t('noTimeBody')} />
  if (state === 'no-day') return <Message title={t('noDayTitle')} body={t('noDayBody')} />
  if (state === 'denied') return <Message title={t('deniedTitle')} body={t('deniedBody')} />
  if (state === 'refused') return <Message title={t('refusedTitle')} body={t('refusedBody')} />
  if (state === 'unsupported') return <Message title={t('unsupportedTitle')} body={t('unsupportedBody')} />
  if (state === 'failed') return <Message title={t('failedTitle')} body={t('failedBody')} />
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3"><h1 id="onboarding-title" className="m-0 text-pretty font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)] lg:text-[28px] lg:leading-[1.15]">{t('title')}</h1><p className="m-0 text-pretty text-[17px] leading-[1.55] text-[var(--fg-2)]">{t('body')}</p></div>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 rounded-[12px] bg-[var(--bg-well)] p-4">
          <div className="flex items-center gap-2"><OrbitMark size={16} /><span translate="no" className="font-mono text-xs text-[var(--fg-3)]">Orbit</span><span className="flex-1" /><time className="font-mono text-xs tabular-nums text-[var(--fg-3)]">{previewTime}</time></div>
          <strong className="block text-base font-medium leading-[1.4] text-[var(--fg-1)]">{title}</strong>
          <span className="text-sm leading-[1.4] text-[var(--fg-2)]">{t('notificationBody')}</span>
        </div>
        <p className="m-0 text-pretty text-xs leading-[1.5] text-[var(--fg-3)]">{t('fine')}</p>
      </div>
    </section>
  )
}

function Message({ title, body }: Readonly<{ title: string; body: string }>) {
  return <section className="flex flex-col gap-3"><h1 id="onboarding-title" className="m-0 text-pretty font-display text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-[var(--fg-1)] lg:text-[28px] lg:leading-[1.15]">{title}</h1><p className="m-0 text-pretty text-[17px] leading-[1.55] text-[var(--fg-2)]">{body}</p></section>
}
