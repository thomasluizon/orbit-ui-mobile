'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import type { BreakdownEditableHabit } from '@orbit/shared/utils'
import {
  buildBreakdownCreateRequest,
  filterValidBreakdownHabits,
  getBreakdownCadenceKey,
  nextBreakdownCadence,
} from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { AlertTriangle } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'

type DraftHabit = BreakdownEditableHabit & { id: string }
type ItemResult = 'done' | 'failed' | undefined

function toDraftHabit(habit: SuggestedSubHabit, index: number): DraftHabit {
  return {
    id: `proposal-${index}`,
    title: habit.title,
    description: habit.description ?? '',
    frequencyUnit: habit.frequencyUnit ?? null,
    frequencyQuantity: habit.frequencyQuantity ?? null,
    days: habit.days ?? null,
    isBadHabit: habit.isBadHabit ?? false,
    dueDate: habit.dueDate ?? null,
    checklistItems: habit.checklistItems ?? null,
  }
}

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const t = useTranslations()
  const bulkCreate = useBulkCreateHabits()
  const [habits, setHabits] = useState<DraftHabit[]>(() => subHabits.map(toDraftHabit))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const failedIds = habits.filter((habit) => results[habit.id] === 'failed').map((habit) => habit.id)

  const submit = async (onlyIds?: readonly string[]) => {
    const selected = onlyIds ? habits.filter((habit) => onlyIds.includes(habit.id)) : habits
    const valid = filterValidBreakdownHabits(selected)
    if (valid.length === 0) return
    try {
      const response = await bulkCreate.mutateAsync(buildBreakdownCreateRequest(valid, parentName, false))
      const next = { ...results }
      response.results.forEach((result) => {
        const habit = selected[result.index]
        if (habit) next[habit.id] = result.status === 'Success' ? 'done' : 'failed'
      })
      setResults(next)
      if (response.results.every((result) => result.status === 'Success')) onConfirmed()
    } catch {
      setResults((current) => ({ ...current, ...Object.fromEntries(selected.map((habit) => [habit.id, 'failed'])) }))
    }
  }

  if (rejected) return <p role="status" className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]">{t('chat.preview.rejected', { name: parentName })}</p>

  const partiallyFailed = failedIds.length > 0
  const rows = habits.map((habit) => ({
    id: habit.id,
    label: editingId === habit.id ? (
      <input autoFocus aria-label={t('chat.preview.editName', { name: habit.title })} className="min-h-11 w-full rounded-[8px] bg-[var(--bg-field)] px-3 text-base outline outline-1 outline-[var(--border-control)] sm:text-sm" value={habit.title} onBlur={() => setEditingId(null)} onChange={(event) => setHabits((current) => current.map((item) => item.id === habit.id ? { ...item, title: event.target.value } : item))} />
    ) : habit.title,
    meta: results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: results[habit.id],
    proposed: results[habit.id] == null,
    irreversible: results[habit.id] == null,
    control: results[habit.id] == null ? (
      <button type="button" aria-label={t('chat.breakdown.frequency', { name: habit.title })} className="min-h-10 rounded-full border-0 bg-[var(--bg-well)] px-3 text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)]" onClick={() => setHabits((current) => current.map((item) => item.id === habit.id ? { ...item, frequencyUnit: nextBreakdownCadence(item.frequencyUnit) } : item))}>
        {t(getBreakdownCadenceKey(habit.frequencyUnit))}
      </button>
    ) : undefined,
  }))

  return (
    <>
    <BlockFrame state={bulkCreate.isPending ? 'acting' : partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} items={rows} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={(
      <div className="flex flex-wrap items-center gap-2">
        {warning?.hasConflict ? <p className="flex basis-full items-center gap-2 text-sm text-[var(--fg-2)]"><AlertTriangle aria-hidden="true" size={16} className="text-[var(--status-overdue)]" />{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</p> : null}
        {partiallyFailed ? <Button size="sm" onClick={() => void submit(failedIds)}>{t('chat.batch.retry', { count: failedIds.length })}</Button> : (
          <>
            <Button size="sm" disabled={bulkCreate.isPending} onClick={() => setConfirmOpen(true)}>{t('chat.preview.approve')}</Button>
            <Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => setEditingId(habits[0]?.id ?? null)}>{t('chat.preview.edit')}</Button>
            <Button size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={() => setRejected(true)}>{t('chat.preview.reject')}</Button>
          </>
        )}
      </div>
    )} />
    <ConfirmSheet open={confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); void submit() }} />
    </>
  )
}
