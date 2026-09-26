'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressRing } from '@/components/ui/progress-ring'
import { Button } from '@/components/ui/pill-button'

export function DaySummaryCard({ daySummary }: Readonly<{ daySummary: DaySummaryCardData }>) {
  const t = useTranslations()
  const router = useRouter()
  const rows = daySummary.due === 0
    ? [{ id: 'due', label: t('chat.daySummary.nothingDue') }]
    : [
        { id: 'due', label: t('chat.daySummary.doneOfDue', { done: daySummary.done, due: daySummary.due }) },
        { id: 'overdue', label: t('chat.daySummary.overdue'), control: daySummary.overdueCount },
      ]
  rows.push({ id: 'streak', label: t('chat.daySummary.streak'), control: daySummary.currentStreak })
  return <div className="mt-2 w-full md:max-w-[65ch]">
    <BlockFrame state="resting" title={t('chat.daySummary.title')} count={null} items={rows}
      body={daySummary.due > 0 && daySummary.completionRate != null
        ? <ProgressRing value={daySummary.completionRate} label={t('chat.daySummary.ring', { done: daySummary.done, due: daySummary.due })} />
        : undefined}
      actions={<Button variant="ghost" size="sm" onClick={() => router.push('/')}>{t('chat.daySummary.open')}</Button>} />
  </div>
}
