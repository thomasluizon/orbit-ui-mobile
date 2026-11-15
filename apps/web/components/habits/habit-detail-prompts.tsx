'use client'

import { useTranslations } from 'next-intl'
import { formatLocaleDate, getHabitLogDateConfirmationKeys, parseAPIDate } from '@orbit/shared/utils'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { useFlag } from '@/hooks/use-flag'

export interface PendingDateLog { habitId: string; intent: 'log' | 'unlog'; date: string; name: string; permanent: boolean }

/** The question after the last checklist item: log the habit, or not now. */
export function ChecklistCompletePrompt({ open, name, onCancel, onConfirm }: Readonly<{ open: boolean; name: string; onCancel: () => void; onConfirm: () => void }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  return (
    <ConfirmSheet
      open={open}
      quickOptions={guided}
      title={t(guided ? 'habits.checklistCompleteQuestion' : 'habits.checklistCompleteTitle')}
      message={t(guided ? 'habits.checklistCompleteLine' : 'habits.checklistCompleteMessage', { name })}
      confirmLabel={t('habits.checklistCompleteConfirm')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

/** The question before a log on another date. A removal that cannot be undone keeps its confirmation. */
export function LogDatePrompt({ pending, fallbackName, fallbackDate, language, onCancel, onConfirm }: Readonly<{ pending: PendingDateLog | null; fallbackName: string; fallbackDate: string; language: string; onCancel: () => void; onConfirm: () => void }>) {
  const t = useTranslations()
  const question = useFlag('orbit_guided_flows') && !pending?.permanent
  const keys = getHabitLogDateConfirmationKeys(pending?.intent, pending?.permanent)
  const values = { name: pending?.name ?? fallbackName, date: formatLocaleDate(parseAPIDate(pending?.date ?? fallbackDate), language, { dateStyle: 'long' }) }
  return (
    <ConfirmSheet
      open={pending !== null}
      quickOptions={question}
      title={question ? t(pending?.intent === 'unlog' ? 'habits.detail.logDateUnlogQuestion' : 'habits.detail.logDateQuestion', values) : t('habits.detail.logDateConfirmTitle')}
      message={question ? '' : t(keys.message, values)}
      confirmLabel={t(keys.action)}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
