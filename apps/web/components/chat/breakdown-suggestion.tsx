'use client'

import { useTranslations } from 'next-intl'
import { useBreakdownSuggestionState } from '@orbit/shared/hooks'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { getBreakdownCadenceKey } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { AlertTriangle } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const t = useTranslations()
  const bulkCreate = useBulkCreateHabits()
  const card = useBreakdownSuggestionState({
    subHabits,
    parentName,
    onBulkCreate: bulkCreate.mutateAsync,
    onConfirmed,
  })

  if (card.rejected) return <p role="status" className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]">{t('chat.preview.rejected', { name: parentName })}</p>

  const rows = card.habits.map((habit) => ({
    id: habit.id,
    label: card.editingId === habit.id ? (
      <input autoFocus aria-label={t('chat.preview.editName', { name: habit.title })} className="min-h-11 w-full rounded-[8px] bg-[var(--bg-field)] px-3 text-base outline outline-1 outline-[var(--border-control)] sm:text-sm" value={habit.title} onBlur={() => card.setEditingId(null)} onChange={(event) => card.editTitle(habit.id, event.target.value)} />
    ) : habit.title,
    meta: card.results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: card.results[habit.id],
    proposed: card.results[habit.id] == null,
    irreversible: card.results[habit.id] == null,
    control: card.results[habit.id] == null ? (
      <button type="button" aria-label={t('chat.breakdown.frequency', { name: habit.title })} className="min-h-10 rounded-full border-0 bg-[var(--bg-well)] px-3 text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)]" onClick={() => card.cycleCadence(habit.id)}>
        {t(getBreakdownCadenceKey(habit.frequencyUnit))}
      </button>
    ) : undefined,
  }))

  return (
    <>
    <BlockFrame state={bulkCreate.isPending ? 'acting' : card.partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} items={rows} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={card.setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={(
      <div className="flex flex-wrap items-center gap-2">
        {warning?.hasConflict ? <p className="flex basis-full items-center gap-2 text-sm text-[var(--fg-2)]"><AlertTriangle aria-hidden="true" size={16} className="text-[var(--status-overdue)]" />{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</p> : null}
        {card.partiallyFailed ? <Button size="sm" onClick={() => void card.submit(card.failedIds)}>{t('chat.batch.retry', { count: card.failedIds.length })}</Button> : (
          <>
            <Button size="sm" disabled={bulkCreate.isPending} onClick={() => card.setConfirmOpen(true)}>{t('chat.preview.approve')}</Button>
            <Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => card.setEditingId(card.habits[0]?.id ?? null)}>{t('chat.preview.edit')}</Button>
            <Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={card.reject}>{t('chat.preview.reject')}</Button>
          </>
        )}
      </div>
    )} />
    <ConfirmSheet open={card.confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.submit() }} />
    </>
  )
}
