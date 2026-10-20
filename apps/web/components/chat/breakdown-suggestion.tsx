'use client'

import { AstraGlyph } from '@/components/ui/astra-glyph'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

import { useTranslations } from 'next-intl'
import { useCallback, useId, useRef, useState, type RefObject } from 'react'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import type { BulkCreateRequest } from '@orbit/shared/types/habit'
import { useBreakdownSuggestionState } from '@/hooks/use-breakdown-suggestion-state'
import type { ConflictWarning, SuggestedSubHabit } from '@orbit/shared/types/chat'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import { getBreakdownCadenceKey } from '@orbit/shared/utils'
import { BlockFrame } from '@/components/ui/block-frame'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Button } from '@/components/ui/pill-button'
import { Menu } from '@/components/ui/menu'
import { AlertTriangle, MoreVertical, Plus, Trash2 } from '@/components/ui/icons'
import { useBulkCreateHabits } from '@/hooks/use-habits'

function buildBreakdownRows({ card, t, editingDisabled }: Readonly<{ card: ReturnType<typeof useBreakdownSuggestionState>; t: ReturnType<typeof useTranslations>; editingDisabled: boolean }>) {
  const visibleHabits = card.completed ? card.habits.filter((habit) => card.results[habit.id] === 'done') : card.habits
  return visibleHabits.map((habit) => ({
    id: habit.id,
    wrapLabel: true,
    editable: !editingDisabled,
    label: card.editingId === habit.id || habit.title.trim() === '' ? (
      <input disabled={editingDisabled} autoFocus={card.editingId === habit.id} placeholder={t('habits.form.newHabit')} onFocus={() => card.setEditingId(habit.id)} data-focus-perimeter="" aria-label={t('chat.preview.editName', { name: habit.title.trim() || t('habits.form.newHabit') })} className="min-h-[var(--touch-min)] w-full rounded-[8px] border-0 bg-[var(--bg-field)] px-3 text-base text-[var(--fg-1)] shadow-[inset_0_0_0_1px_var(--border-control)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] forced-colors:border-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight] sm:text-sm" value={habit.title} onBlur={() => card.setEditingId(null)} onChange={(event) => card.editTitle(habit.id, event.target.value)} />
    ) : <PersonalTextDetails outset proposed={habit.proposed && card.results[habit.id] == null}>{habit.title}</PersonalTextDetails>,
    meta: card.results[habit.id] === 'failed' ? t('blockFrame.status.failed') : undefined,
    status: card.results[habit.id],
    proposed: habit.proposed && card.results[habit.id] == null,
    irreversible: card.results[habit.id] == null,
    control: card.results[habit.id] == null ? (
      <><button type="button" disabled={editingDisabled} aria-label={t('chat.breakdown.frequency', { name: habit.title.trim() || t('habits.form.newHabit') })} className="min-h-[var(--touch-min)] rounded-full border-0 bg-[var(--bg-well)] px-3 text-sm text-[var(--fg-2)] hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]" onClick={() => card.cycleCadence(habit.id)}>
        {t(getBreakdownCadenceKey(habit.frequencyUnit))}
      </button>
      {!card.hasSubmitted ? <Button variant="ghost" quiet iconOnly minimumHeight={TOUCH_TARGET_MIN} disabled={editingDisabled} label={t('habits.breakdown.removeHabit', { name: habit.title.trim() || t('chat.breakdown.unnamedHabit') })} onClick={() => card.setRemovalId(habit.id)}>
        <Trash2 aria-hidden="true" size={20} strokeWidth={1.5} />
      </Button> : null}</>
    ) : undefined,
  }))
}

function BreakdownActions({ card, isPending, editingDisabled, warning, parentName, actionsRef }: Readonly<{ actionsRef: RefObject<HTMLButtonElement | null>; card: ReturnType<typeof useBreakdownSuggestionState>; isPending: boolean; editingDisabled: boolean; warning?: ConflictWarning | null; parentName: string }>) {
  const t = useTranslations()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const createErrorKey = card.hasSubmitted ? 'habits.breakdown.retryError' : 'habits.breakdown.createError'
  const isEmpty = card.habits.length === 0
  const addVariant = isEmpty ? 'primary' : 'ghost'
  const approveVariant = isEmpty ? 'secondary' : 'primary'
  return (
<>
    <p role="status" className={card.capacityDenied ? 'basis-full text-sm text-[var(--fg-2)]' : 'sr-only'}>{card.capacityDenied ? t('habits.breakdown.capacityDenied') : ''}</p>
        <p role="status" className={card.atCapacity && !card.hasSubmitted ? 'basis-full text-sm text-[var(--fg-2)]' : 'sr-only'}>{card.atCapacity && !card.hasSubmitted ? t('habits.breakdown.limit', { limit: MAX_BULK_OPERATION_SIZE }) : ''}</p>
        <p role="alert" className={card.createError ? 'basis-full text-sm text-[var(--status-bad-text)]' : 'sr-only'}>{card.createError ? t(createErrorKey) : ''}</p>
        {warning?.hasConflict ? <p className="flex basis-full items-center gap-2 text-sm text-[var(--fg-2)]"><AlertTriangle aria-hidden="true" size={16} className="text-[var(--status-overdue)]" />{t('chat.breakdown.conflict', { name: warning.conflictingHabits[0]?.habitTitle ?? parentName })}</p> : null}
        {/* eslint-disable-next-line local/max-button-words -- ORB-55 owns this existing Astra label. */}
        {card.partiallyFailed ? <Button size="sm" disabled={isPending} loading={isPending} onClick={() => void card.submit(card.failedIds)}>{t('chat.batch.retry', { count: card.failedIds.length })}</Button> : (
          <>
            <Button size="sm" variant={addVariant} leadingIcon={<Plus aria-hidden="true" size={16} />} disabled={editingDisabled || card.confirmOpen || card.atCapacity} onClick={card.addHabit}>{t('habits.breakdown.addHabit')}</Button>
            <Button buttonRef={actionsRef} size="sm" variant="ghost" iconOnly label={t('habits.actions.more')} controlsId={menuId} hasPopup="menu" expanded={menuOpen && !editingDisabled} disabled={editingDisabled} onClick={() => setMenuOpen(!menuOpen)}>
              <MoreVertical aria-hidden="true" size={20} />
            </Button>
            <Menu id={menuId} open={menuOpen && !editingDisabled} anchorRef={actionsRef} title={t('habits.actions.more')} restoreFocusOnSelect={false}
              items={[
                { id: 'edit', label: t('chat.preview.edit'), icon: 'pencil', disabled: editingDisabled || isEmpty },
                { id: 'reject', label: t('chat.preview.reject'), disabled: editingDisabled },
              ]}
              onClose={() => setMenuOpen(false)}
              onSelect={(id) => { if (id === 'edit') card.setEditingId(card.habits[0]?.id ?? null); else if (id === 'reject') card.reject() }} />
            <Button size="sm" variant={approveVariant} disabled={editingDisabled || card.habits.length === 0} loading={isPending} onClick={() => card.setConfirmOpen(true)}>{t('chat.preview.approve')}</Button>
          </>
        )}
    </>
  )
}

export function BreakdownSuggestion({ parentName, subHabits, warning, onConfirmed }: Readonly<{ parentName: string; subHabits: SuggestedSubHabit[]; warning?: ConflictWarning | null; onConfirmed: () => void; onCancelled: () => void }>) {
  const t = useTranslations()
  const actionsRef = useRef<HTMLButtonElement>(null)
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
  const isPending = bulkCreate.isPending || card.isSubmitting
  const editingDisabled = isPending || card.groupingLocked

  if (card.rejected) return <p role="status" className="rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]">{t('chat.preview.rejected', { name: parentName })}</p>

  const rows = buildBreakdownRows({ card, t, editingDisabled })

  return (
    <>
    <BlockFrame state={isPending ? 'acting' : card.partiallyFailed ? 'partiallyFailed' : 'resting'} title={t('chat.breakdown.title', { name: parentName })} titleMode="typed" items={rows} body={card.completed ? null : (
      <div className="min-w-0 shrink-0">
      {card.habits.length === 0 ? <div className="flex flex-col items-center gap-6 text-center text-[var(--fg-2)]"><AstraGlyph size={96} color="var(--fg-1)" /><p className="text-sm">{t('chat.breakdown.empty')}</p></div> : null}
      <label className="flex min-h-[var(--touch-min)] w-full shrink-0 items-start gap-1 rounded-[12px] px-2 py-3 text-sm text-[var(--fg-2)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--fg-1)] has-[:disabled]:pointer-events-none has-[:disabled]:opacity-60">
        <input type="checkbox" name="createAsParent" className="sr-only" checked={card.createAsParent} disabled={isPending || card.groupingLocked} onChange={(event) => card.setCreateAsParent(event.target.checked)} />
        <Checkbox as="span" checked={card.createAsParent} onChange={card.setCreateAsParent} />
        <span className="min-w-0 flex-1">{t('habits.breakdown.createAsParent')}</span>
      </label>
      <div role="status">{card.groupingDenied ? <p className="text-pretty text-sm text-[var(--fg-2)]">{t('habits.breakdown.groupingDenied')}</p> : null}</div>
      </div>
    )} proposedLabel={t('chat.preview.proposed')} editLabel={t('chat.preview.editItem')} onEditItem={card.setEditingId} irreversibleLabel={t('chat.operation.irreversible')} confirmNote={t('chat.breakdown.confirmNote')} actions={card.completed ? <p role="status" className="text-sm text-[var(--fg-2)]">{t('chat.action.completed')}</p> : <BreakdownActions actionsRef={actionsRef} card={card} isPending={isPending} editingDisabled={editingDisabled} warning={warning} parentName={parentName} />} />
    <ConfirmSheet open={card.confirmOpen} title={t('chat.breakdown.confirmTitle')} message={t('chat.breakdown.confirmBody', { name: parentName })} confirmLabel={t('chat.breakdown.confirm')} onCancel={() => card.setConfirmOpen(false)} onConfirm={() => { card.setConfirmOpen(false); void card.submit() }} />
      <ConfirmSheet open={removalHabit != null} title={t('chat.breakdown.removeTitle')} message={t('chat.breakdown.removeBody', { name: removalHabit?.title.trim() || t('chat.breakdown.unnamedHabit') })} confirmLabel={t('chat.operation.remove')} destructive loading={isPending} onCancel={() => card.setRemovalId(null)} onConfirm={() => { card.removeHabit(); actionsRef.current?.focus() }} />
    </>
  )
}
