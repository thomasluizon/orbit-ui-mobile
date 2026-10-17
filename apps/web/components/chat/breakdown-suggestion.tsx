'use client'

import { AstraGlyph } from '@/components/ui/astra-glyph'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

import { useTranslations } from 'next-intl'
import { useCallback, useRef } from 'react'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import type { BulkCreateRequest } from '@orbit/shared/types/habit'
import { useBreakdownSuggestionState } from '@/hooks/use-breakdown-suggestion-state'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { getBreakdownCadenceKey } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { AlertTriangle, Trash2 } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const t = useTranslations()
  const rejectRef = useRef<HTMLButtonElement>(null)
  const bulkCreate = useBulkCreateHabits()
  const trackCardOperation = useChatCardOperation()
  const { mutateAsync } = bulkCreate
  const createHabits = useCallback((request: BulkCreateRequest) =>
    trackCardOperation(() => mutateAsync(request)), [mutateAsync, trackCardOperation])
  const card = useBreakdownSuggestionState({
    subHabits,
    parentName,
    onBulkCreate: createHabits,
    onConfirmed,
  })

  const removalHabit = card.habits.find((habit) => habit.id === card.removalId)

  if (card.rejected) return <p role="status" className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]">{t('chat.preview.rejected', { name: parentName })}</p>

  const rows = card.habits.map((habit) => ({
    id: habit.id,
    wrapLabel: true,
    label: card.editingId === habit.id ? (
      <input autoFocus data-focus-perimeter="" aria-label={t('chat.preview.editName', { name: habit.title })} className="min-h-[var(--touch-min)] w-full rounded-[8px] border-0 bg-[var(--bg-field)] px-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight] sm:text-sm" value={habit.title} onBlur={() => card.setEditingId(null)} onChange={(event) => card.editTitle(habit.id, event.target.value)} />
    ) : <PersonalTextDetails outset proposed={card.results[habit.id] == null}>{habit.title}</PersonalTextDetails>,
    meta: card.results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: card.results[habit.id],
    proposed: card.results[habit.id] == null,
    irreversible: card.results[habit.id] == null,
    control: card.results[habit.id] == null ? (
      <>
      <button type="button" aria-label={t('chat.breakdown.frequency', { name: habit.title })} className="min-h-[var(--touch-min)] rounded-full border-0 bg-[var(--bg-well)] px-3 text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => card.cycleCadence(habit.id)}>
        {t(getBreakdownCadenceKey(habit.frequencyUnit))}
      </button>
      <Button variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN} disabled={bulkCreate.isPending} label={t('habits.breakdown.removeHabit', { name: habit.title || t('chat.breakdown.unnamedHabit') })} onClick={() => card.setRemovalId(habit.id)}>
        <Trash2 aria-hidden="true" size={20} strokeWidth={1.5} />
      </Button>
      </>
    ) : undefined,
  }))

  return (
    <>
    <BlockFrame state={bulkCreate.isPending ? 'acting' : card.partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} titleMode="typed" items={rows} body={card.habits.length === 0 ? <div className="flex flex-col items-center gap-6 text-center text-[var(--fg-2)]"><AstraGlyph size={96} color="var(--fg-1)" /><p className="text-sm">{t('chat.breakdown.empty')}</p></div> : undefined} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={card.setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={(
      <>
        {warning?.hasConflict ? <p className="flex basis-full items-center gap-2 text-sm text-[var(--fg-2)]"><AlertTriangle aria-hidden="true" size={16} className="text-[var(--status-overdue)]" />{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</p> : null}
        {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
        {card.partiallyFailed ? <Button size="sm" onClick={() => void card.submit(card.failedIds)}>{t('chat.batch.retry', { count: card.failedIds.length })}</Button> : (
          <>
            <Button size="sm" variant="ghost" disabled={bulkCreate.isPending || card.habits.length === 0} onClick={() => card.setEditingId(card.habits[0]?.id ?? null)}>{t('chat.preview.edit')}</Button>
            <Button buttonRef={rejectRef} size="sm" variant="ghost" disabled={bulkCreate.isPending} onClick={card.reject}>{t('chat.preview.reject')}</Button>
            <Button size="sm" disabled={bulkCreate.isPending || card.habits.length === 0} onClick={() => card.setConfirmOpen(true)}>{t('chat.preview.approve')}</Button>
          </>
        )}
      </>
    )} />
    <ConfirmSheet open={card.confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.submit() }} />
    <ConfirmSheet open={removalHabit != null} title={t('chat.breakdown.removeTitle')} message={t('chat.breakdown.removeBody', { name: removalHabit?.title || t('chat.breakdown.unnamedHabit') })} confirmLabel={t('chat.operation.remove')} destructive loading={bulkCreate.isPending} onCancel={() => card.setRemovalId(null)} onConfirm={() => { card.removeHabit(); rejectRef.current?.focus() }} />
    </>
  )
}
