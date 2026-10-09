'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { ActionRow } from '@/components/ui/action-row'

import type { Time24 } from '@orbit/shared/contracts/forms'
import { TimeField } from '@/components/ui/time-field'
import { useTimeFormat } from '@/hooks/use-time-format'

import { SharedPendingOperationCard, type PendingOperationCardAdapterProps, type PendingOperationCardRenderers, type PendingOperationVerificationProps } from './shared-pending-operation-card'
import { buildPendingOperationCardLabels, PENDING_OPERATION_ITEM_SEARCH_THRESHOLD, PENDING_OPERATION_WEEKDAYS, type PendingOperationEditSheetProps } from '@orbit/shared/chat'
import { useLocale, useTranslations } from 'next-intl'
import { usePendingOperationStepUpVerification } from '@/hooks/use-pending-operation-card-state'
import { BlockFrame } from '@/components/ui/block-frame'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { OtpInput } from '@/components/ui/otp-input'
import { Button } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { StepUp } from '@/components/ui/step-up'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { addPendingOperationListRow, changePendingOperationListRow, isPendingOperationEditableField, pendingOperationListRows, removePendingOperationListRow } from '@orbit/shared/hooks'
import { XCircle, X } from '@/components/ui/icons'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
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
    <TimeField label={`${rowLabel}: ${labels.reminderTime}`} value={(typeof row.time === 'string' ? row.time : '') as Time24 | ''} onChange={(next) => change('time', next)} disabled={busy} />
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
        <div className="flex justify-end"><button type="button" aria-label={`${labels.remove} ${rowLabel}`} disabled={busy} onClick={() => onChange(removePendingOperationListRow(value, index))} className="flex size-[var(--touch-min)] items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"><X aria-hidden="true" size={20} strokeWidth={1.5} /></button></div>
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
    titleMode="typed"
    onClose={() => { if (!busy) onClose() }}
    actions={<ActionRow>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => closeSheet(onClose)}>{labels.cancel}</Button>
      <Button size="sm" disabled={busy} onClick={() => void save()}>{labels.save}</Button>
    </ActionRow>}
  >
    <div className="flex flex-col gap-4">
      {editableItems.length > 1 ? <div className="flex flex-col gap-2">{showSearch ? <Input label={labels.search} value={query} onChange={setQuery} disabled={busy} /> : null}<RadioGroup aria-label={labels.editTitle}>{editableItems.filter((entry) => !showSearch || entry.entityName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) =>
        busy
          ? <RadioRow key={entry.itemId} label={entry.entityName} textMode="personal" selected={entry.itemId === item.itemId} disabled reason={labels.acting} />
          : <RadioRow key={entry.itemId} label={entry.entityName} textMode="personal" selected={entry.itemId === item.itemId} onSelect={() => onSelectItem(entry.itemId)} />)}</RadioGroup></div> : null}
      {item.fields.filter(isPendingOperationEditableField).map((field) => {
        const label = labels.fieldLabels[field.field] ?? field.field
        if (field.field === 'checklist_items' || field.field === 'reminder_times' || field.field === 'scheduled_reminders') return <ListFieldEditor key={field.field} field={field.field} value={draft[field.field] ?? '[]'} labels={labels} busy={busy} error={error} onChange={(value) => onChange(field.field, value)} />
        if (field.valueType === 'boolean') return <div key={field.field} className="flex items-center justify-between gap-3"><span className="text-sm">{label}</span><Switch label={label} checked={draft[field.field] === 'true'} disabled={busy} onChange={(value) => onChange(field.field, String(value))} /></div>
        if (field.field === 'days') {
          const days = (draft.days ?? '').split(',').map((day) => day.trim())
          return <fieldset key={field.field}><legend className="mb-2 text-sm">{label}</legend><div className="flex flex-wrap gap-2">{PENDING_OPERATION_WEEKDAYS.map((day) => <button key={day} type="button" aria-pressed={days.includes(day)} disabled={busy} onClick={() => onChange('days', PENDING_OPERATION_WEEKDAYS.filter((name) => name === day ? !days.includes(name) : days.includes(name)).join(', '))} className="min-h-[var(--touch-min)] rounded-full border border-[var(--hairline)] px-3 text-sm enabled:hover:bg-[var(--bg-hover)] aria-pressed:border-[var(--primary)] aria-pressed:bg-[var(--selection-bg)] aria-pressed:enabled:hover:bg-[var(--bg-hover)] transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">{labels.dayLabels[day]}</button>)}</div></fieldset>
        }
        if (field.valueType === 'time') return <TimeField key={field.field} label={label} value={(draft[field.field] ?? '') as Time24 | ''} onChange={(value) => onChange(field.field, value)} disabled={busy} error={error ? labels.invalid : undefined} />
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
  const completed: PendingOperationVerificationProps['onCompleted'] = (result) => {
    if (openRef.current) closeSheet(() => onCompleted(result))
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
      actions={<ActionRow>
        <Button size="sm" variant="ghost" disabled={!open} onClick={() => { if (open) closeSheet() }}>{t('common.cancel')}</Button>
        <Button size="sm" loading={verifying} disabled={!open || code.length !== 6} onClick={() => { if (open) void verify() }}>{t('stepUp.confirm')}</Button>
      </ActionRow>}
    >
      <OtpInput label={t('stepUp.codeLabel')} value={code} onChange={setCode} error={error} hint={t('stepUp.codeHint')} disabled={verifying || !open} />
      <p className="text-sm text-[var(--fg-3)]">{t('stepUp.neverShare')}</p>
    </Sheet>
  )
}

const pendingOperationRenderers = {
  blockFrame: (props) => <BlockFrame {...props} items={props.items.map((item) => ({ ...item, label: typeof item.label === 'string' && item.id !== 'remaining' ? <PersonalTextDetails proposed={item.proposed}>{item.label}</PersonalTextDetails> : item.label }))} />,
  button: ({ label, ...props }) => <PreviewButton label={label} {...props} />,
  confirmSheet: (props) => <ConfirmSheet {...props} />,
  stepUp: (props) => <div className="basis-full min-w-0"><StepUp {...props} /></div>,
  verification: (props) => <StepUpVerificationSheet {...props} />,
  editSheet: (props) => <EditPendingOperationSheet {...props} />,
  removeItem: (label, disabled, onClick) => <button
    type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
  ><X aria-hidden="true" size={20} strokeWidth={1.5} /></button>,
  notice: (message) => <p role="status" className="text-sm text-[var(--fg-2)]">{message}</p>,
  rejected: (message) => <p role="status" data-preview-rejection-status="" className={message ? 'flex items-start gap-3 rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]' : 'sr-only'}>{message ? <><XCircle aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0 text-[var(--fg-3)]" /><span className="min-w-0 flex-1 leading-[1.55]">{message}</span></> : null}</p>,
} satisfies PendingOperationCardRenderers

function PreviewButton({ label, variant, ...props }: Readonly<import('@orbit/shared/chat').PendingOperationButtonSpec>) {
  const wide = useIsWideDesktop()
  return <Button size="sm" variant={variant === 'primary' && wide ? 'secondary' : variant} {...props}>{label}</Button>
}

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onRevise,
  onRefresh,
  onOpenTarget,
  onPrepareStepUp,
  onVerifyStepUp,
  focusTitleOnMount,
  savedState,
  onStateChange,
}: Readonly<PendingOperationCardAdapterProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()

  return <SharedPendingOperationCard
    pendingOperation={pendingOperation}
    onConfirmExecute={onConfirmExecute}
    onRevise={onRevise}
    onRefresh={onRefresh}
    onOpenTarget={onOpenTarget}
    onPrepareStepUp={onPrepareStepUp}
    onVerifyStepUp={onVerifyStepUp}
    focusTitleOnMount={focusTitleOnMount}
    savedState={savedState}
    onStateChange={onStateChange}
    render={pendingOperationRenderers}
    labels={(operation) => buildPendingOperationCardLabels(operation, t, displayTime, locale)}
  />
}
