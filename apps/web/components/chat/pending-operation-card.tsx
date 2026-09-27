'use client'

import { SharedPendingOperationCard, type PendingOperationCardAdapterProps, type PendingOperationCardRenderers, type PendingOperationVerificationProps } from './shared-pending-operation-card'
import { buildPendingOperationCardLabels, PENDING_OPERATION_ITEM_SEARCH_THRESHOLD, PENDING_OPERATION_WEEKDAYS, type PendingOperationEditSheetProps } from '@orbit/shared/chat'
import { useTranslations } from 'next-intl'
import { usePendingOperationStepUpVerification } from '@/hooks/use-pending-operation-card-state'
import { Badge } from '@/components/ui/badge'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Button } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { addPendingOperationListRow, changePendingOperationListRow, isPendingOperationEditableField, pendingOperationListRows, removePendingOperationListRow } from '@orbit/shared/hooks'
import { ArrowRight, X } from '@/components/ui/icons'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-row'
import { MAX_CHECKLIST_ITEMS, MAX_SCHEDULED_REMINDERS } from '@orbit/shared/validation'

function ListRowFields({ field, row, rowLabel, labels, busy, change }: Readonly<{
  field: string
  row: Record<string, unknown>
  rowLabel: string
  labels: PendingOperationEditSheetProps['labels']
  busy: boolean
  change: (key: string, value: string | boolean) => void
}>) {
  if (field === 'checklist_items') return <>
    <Input label={rowLabel} value={typeof row.text === 'string' ? row.text : ''} onChange={(next) => change('text', next)} disabled={busy} />
    <Switch label={`${rowLabel}: ${labels.checked}`} checked={row.is_checked === true} onChange={(next) => change('is_checked', next)} disabled={busy} />
  </>
  if (field === 'scheduled_reminders') return <>
    <RadioGroup aria-label={`${rowLabel}: ${labels.reminderWhen}`} className="flex flex-col gap-1">
      {busy ? <RadioRow label={labels.reminderSameDay} selected={row.when === 'same_day'} disabled reason={labels.acting} /> : <RadioRow label={labels.reminderSameDay} selected={row.when === 'same_day'} onSelect={() => change('when', 'same_day')} />}
      {busy ? <RadioRow label={labels.reminderDayBefore} selected={row.when === 'day_before'} disabled reason={labels.acting} /> : <RadioRow label={labels.reminderDayBefore} selected={row.when === 'day_before'} onSelect={() => change('when', 'day_before')} />}
    </RadioGroup>
    <Input label={`${rowLabel}: ${labels.reminderTime}`} value={typeof row.time === 'string' ? row.time : ''} onChange={(next) => change('time', next)} disabled={busy} />
  </>
  return <Input label={rowLabel} value={typeof row.value === 'string' || typeof row.value === 'number' ? String(row.value) : ''} onChange={(next) => change('value', next)} disabled={busy} kind="number" />
}

function ListFieldEditor({ field, value, labels, busy, error, onChange }: Readonly<{
  field: string
  value: string
  labels: PendingOperationEditSheetProps['labels']
  busy: boolean
  error: string | undefined
  onChange: (value: string) => void
}>) {
  const fieldLabel = labels.fieldLabels[field] ?? field
  const errorId = useId()
  const rows = pendingOperationListRows(value)
  const limit = field === 'checklist_items' ? MAX_CHECKLIST_ITEMS : field === 'scheduled_reminders' ? MAX_SCHEDULED_REMINDERS : undefined
  const atLimit = limit !== undefined && rows.length >= limit
  return <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-3">
    <legend className="text-sm font-medium">{fieldLabel}</legend>
    {error ? <p id={errorId} role="alert" className="text-sm text-[var(--status-bad-text)]">{labels.invalid}</p> : null}
    {rows.map((entry, index) => {
      const row = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { value: entry }
      const rowLabel = `${fieldLabel} ${index + 1}`
      return <div key={`${field}-${index}`} className="flex flex-col gap-2">
        <div className="flex justify-end"><button type="button" aria-label={`${labels.remove} ${rowLabel}`} disabled={busy} onClick={() => onChange(removePendingOperationListRow(value, index))} className="flex size-11 items-center justify-center rounded-[8px] text-[var(--fg-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40"><X aria-hidden="true" size={20} strokeWidth={1.5} /></button></div>
        <ListRowFields field={field} row={row} rowLabel={rowLabel} labels={labels} busy={busy} change={(key, next) => onChange(changePendingOperationListRow(value, index, key, next))} />
      </div>
    })}
    <Button size="sm" variant="ghost" disabled={busy || atLimit} onClick={() => onChange(addPendingOperationListRow(value, field))}>{labels.addListRow}</Button>
    {atLimit ? <p className="text-sm text-[var(--fg-2)]">{field === 'checklist_items' ? labels.checklistLimit : labels.scheduledLimit}</p> : null}
  </fieldset>
}


function EditPendingOperationSheet({ item, items, draft, labels, busy, stale, error, onSelectItem, onChange, onClose, onSave }: Readonly<PendingOperationEditSheetProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const [query, setQuery] = useState('')
  const editableItems = items.filter((entry) => entry.fields.some(isPendingOperationEditableField))
  const showSearch = editableItems.length > PENDING_OPERATION_ITEM_SEARCH_THRESHOLD
  useEffect(() => { if (stale) closeSheet(onClose) }, [stale, closeSheet, onClose])
  const save = async () => { if (await onSave()) closeSheet(onClose) }
  return <Sheet
    ref={sheetRef}
    title={`${labels.editTitle}: ${item.entityName}`}
    onClose={() => { if (!busy) onClose() }}
    actions={<>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => closeSheet(onClose)}>{labels.cancel}</Button>
      <Button size="sm" disabled={busy} onClick={() => void save()}>{labels.save}</Button>
    </>}
  >
    <div className="flex flex-col gap-4">
      {editableItems.length > 1 ? <div className="flex flex-col gap-2">{showSearch ? <Input label={labels.search} value={query} onChange={setQuery} disabled={busy} /> : null}<div>{editableItems.filter((entry) => !showSearch || entry.entityName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) =>
        busy
          ? <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} disabled reason={labels.acting} />
          : <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} onSelect={() => onSelectItem(entry.itemId)} />)}</div></div> : null}
      {item.fields.filter(isPendingOperationEditableField).map((field) => {
        const label = labels.fieldLabels[field.field] ?? field.field
        if (field.field === 'checklist_items' || field.field === 'reminder_times' || field.field === 'scheduled_reminders') return <ListFieldEditor key={field.field} field={field.field} value={draft[field.field] ?? '[]'} labels={labels} busy={busy} error={error} onChange={(value) => onChange(field.field, value)} />
        if (field.valueType === 'boolean') return <div key={field.field} className="flex items-center justify-between gap-3"><span className="text-sm">{label}</span><Switch label={label} checked={draft[field.field] === 'true'} disabled={busy} onChange={(value) => onChange(field.field, String(value))} /></div>
        if (field.field === 'days') {
          const days = (draft.days ?? '').split(',').map((day) => day.trim())
          return <fieldset key={field.field}><legend className="mb-2 text-sm">{label}</legend><div className="flex flex-wrap gap-2">{PENDING_OPERATION_WEEKDAYS.map((day) => <button key={day} type="button" aria-pressed={days.includes(day)} disabled={busy} onClick={() => onChange('days', PENDING_OPERATION_WEEKDAYS.filter((name) => name === day ? !days.includes(name) : days.includes(name)).join(', '))} className="min-h-11 rounded-[8px] border border-[var(--hairline)] px-3 text-sm aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--bg-hover)]">{labels.dayLabels[day]}</button>)}</div></fieldset>
        }
        return <Input
          key={field.field}
          label={label}
          value={draft[field.field] ?? ''}
          onChange={(value) => onChange(field.field, value)}
          disabled={busy}
          kind={field.valueType === 'number' ? 'number' : undefined}
          error={error ? labels.invalid : undefined}
        />
      })}
      {error && item.fields.every((field) => field.valueType === 'action' || field.valueType === 'boolean' || field.field === 'days') ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{labels.invalid}</p> : null}
    </div>
  </Sheet>
}

function StepUpVerificationSheet({
  open,
  onClosed,
  pendingOperationId,
  prepared,
  onClose,
  onCompleted,
  onVerify,
}: Readonly<PendingOperationVerificationProps>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const openRef = useRef(open)
  useLayoutEffect(() => { openRef.current = open }, [open])
  useEffect(() => {
    if (!open) closeSheet(onClosed)
  }, [open, onClosed, closeSheet])
  const completed = (status: 'done' | 'failed') => {
    if (openRef.current) closeSheet(() => onCompleted(status))
  }
  const { code, error, setCode, verifying, verify } = usePendingOperationStepUpVerification({
    genericError: t('stepUp.genericError'),
    onCompleted: completed,
    onVerify,
    pendingOperationId,
    prepared,
  })

  return (
    <Sheet
      ref={sheetRef}
      title={t('stepUp.title')}
      onClose={open ? onClose : onClosed}
      actions={<>
        <Button size="sm" variant="ghost" disabled={!open} onClick={() => { if (open) closeSheet() }}>{t('common.cancel')}</Button>
        <Button size="sm" loading={verifying} disabled={!open || code.length !== 6} onClick={() => { if (open) void verify() }}>{t('stepUp.confirm')}</Button>
      </>}
    >
      <OtpInput label={t('stepUp.codeLabel')} value={code} onChange={setCode} error={error} hint={t('stepUp.codeHint')} disabled={verifying || !open} />
      <p className="text-sm text-[var(--fg-3)]">{t('stepUp.neverShare')}</p>
    </Sheet>
  )
}

const pendingOperationRenderers = {
  blockFrame: (props) => <BlockFrame {...props} />,
  button: ({ label, ...props }) => <Button size="sm" {...props}>{label}</Button>,
  confirmSheet: (props) => <ConfirmSheet {...props} />,
  risk: (label) => <Badge variant="outline">{label}</Badge>,
  stepUp: (props) => <StepUp {...props} />,
  verification: (props) => <StepUpVerificationSheet {...props} />,
  editSheet: (props) => <EditPendingOperationSheet {...props} />,
  removeItem: (label, disabled, onClick) => <button
    type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className="flex size-11 shrink-0 items-center justify-center rounded-[8px] text-[var(--fg-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
  ><X aria-hidden="true" size={20} strokeWidth={1.5} /></button>,
  notice: (message) => <p role="status" className="text-sm text-[var(--fg-2)]">{message}</p>,
  actionRow: (...children) => <div className="flex flex-wrap items-center gap-2">{children}</div>,
  diffLabel: (field, oldValue, newValue, accessible) => <span aria-label={accessible} className="flex flex-wrap items-center gap-2 text-sm">
    <span>{field}:</span><span className="text-[var(--fg-3)]">{oldValue}</span>
    <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} className="rtl:rotate-180" />
    <span className="font-medium text-[var(--fg-1)]">{newValue}</span>
  </span>,
} satisfies PendingOperationCardRenderers

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onRevise,
  onRefresh,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardAdapterProps>) {
  const t = useTranslations()

  return <SharedPendingOperationCard
    pendingOperation={pendingOperation}
    onConfirmExecute={onConfirmExecute}
    onRevise={onRevise}
    onRefresh={onRefresh}
    onPrepareStepUp={onPrepareStepUp}
    onVerifyStepUp={onVerifyStepUp}
    render={pendingOperationRenderers}
    labels={buildPendingOperationCardLabels(pendingOperation, t)}
  />
}
