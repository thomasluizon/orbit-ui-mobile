'use client'

import { StructuredPreviewField } from './structured-preview-field'
import { AstraOffer } from './astra-offer'
import { IconButton } from '@/components/ui/icon-button'

import { WeekdayPicker } from '@/components/ui/weekday-picker'

import { getAccountDay, nowDate, toTime24 } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'

import { PreviewItemTitle } from './preview-item-title'
import { ActionRow } from '@/components/ui/action-row'

import { TimeField } from '@/components/ui/time-field'
import { useTimeFormat } from '@/hooks/use-time-format'

import { SharedPendingOperationCard, type PendingOperationCardAdapterProps, type PendingOperationCardRenderers, type PendingOperationVerificationProps } from './shared-pending-operation-card'
import { type AstraOfferProps, buildPendingOperationCardLabels, PENDING_OPERATION_ITEM_SEARCH_THRESHOLD, PENDING_OPERATION_WEEKDAYS, type PendingOperationEditSheetProps } from '@orbit/shared/chat'
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
import { XCircle, X, Plus, RefreshCw, Pencil } from '@/components/ui/icons'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { RadioRow } from '@/components/ui/select-check'
import { RadioGroup } from '@/components/ui/radio-group'
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
      {busy ? <RadioRow label={labels.reminderSameDay} selected={row.when === 'same_day'} busy reason={labels.acting} /> : <RadioRow label={labels.reminderSameDay} selected={row.when === 'same_day'} onSelect={() => change('when', 'same_day')} />}
      {busy ? <RadioRow label={labels.reminderDayBefore} selected={row.when === 'day_before'} busy reason={labels.acting} /> : <RadioRow label={labels.reminderDayBefore} selected={row.when === 'day_before'} onSelect={() => change('when', 'day_before')} />}
    </RadioGroup>
    <TimeField label={`${rowLabel}: ${labels.reminderTime}`} value={toTime24(typeof row.time === 'string' ? row.time : '')} onChange={(next) => change('time', next)} disabled={busy} />
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
    <IconButton label={labels.addListRow} disabled={busy || atLimit} onClick={() => onChange(addPendingOperationListRow(value, field))}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
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
      {item.placement?.selected === 'checklist_item' ? <p className="text-sm text-[var(--fg-2)]">{labels.placementChecklistNote}</p> : null}
      {editableItems.length > 1 ? <div className="flex flex-col gap-2">{showSearch ? <Input label={labels.search} value={query} onChange={setQuery} disabled={busy} /> : null}<RadioGroup aria-label={labels.editTitle}>{editableItems.filter((entry) => !showSearch || entry.entityName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) =>
        busy
          ? <RadioRow key={entry.itemId} label={entry.entityName} textMode="personal" selected={entry.itemId === item.itemId} busy reason={labels.acting} />
          : <RadioRow key={entry.itemId} label={entry.entityName} textMode="personal" selected={entry.itemId === item.itemId} onSelect={() => onSelectItem(entry.itemId)} />)}</RadioGroup></div> : null}
      {item.fields.filter((field) => isPendingOperationEditableField(field)
        && !(item.placement?.selected === 'new_parent' && field.field === 'parent_habit_id')).map((field) => {
        const fieldName = field.field.split('/').at(-1)!
        const label = labels.fieldLabels[fieldName] ?? fieldName
        const choices = item.fieldOptions?.find((entry) => entry.field === field.field && entry.field === 'parent_habit_id')
        if (choices) return <ParentChoice key={field.field} itemId={item.itemId} itemName={item.entityName} field={choices} labels={labels} disabled={busy}
          selectedValue={draft[field.field] === '' ? null : draft[field.field]} onSelect={(value) => { if (value === null || typeof value === 'string') onChange(field.field, value ?? '') }} />
        if (field.field === 'checklist_items' || field.field === 'reminder_times' || field.field === 'scheduled_reminders') return <ListFieldEditor key={field.field} field={field.field} value={draft[field.field] ?? '[]'} labels={labels} busy={busy} error={error} onChange={(value) => onChange(field.field, value)} />
        if (field.proposedValue !== null && typeof field.proposedValue === 'object' && fieldName !== 'days') return <StructuredPreviewField key={field.field} field={field.field} value={draft[field.field] ?? JSON.stringify(field.proposedValue)} labels={labels} busy={busy} error={error} onChange={value => onChange(field.field, value)} />
        if (field.valueType === 'boolean') return <Switch key={field.field} label={label} checked={draft[field.field] === 'true'} disabled={busy} onChange={(value) => onChange(field.field, String(value))} />
        if (fieldName === 'days') {
          const days = (draft[field.field] ?? '').split(',').map((day) => day.trim())
          return <div key={field.field} className="flex flex-col gap-2"><p className="text-sm">{label}</p><WeekdayPicker label={label} days={days} scheduleLocked={busy} dayOptions={PENDING_OPERATION_WEEKDAYS.map(day => ({ value: day, label: labels.dayLabels[day]!, accessibleLabel: labels.dayLabels[day]! }))} onToggleDay={day => onChange(field.field, PENDING_OPERATION_WEEKDAYS.filter(name => name === day ? !days.includes(name) : days.includes(name)).join(', '))} /></div>
        }
        if (field.valueType === 'time') return <TimeField key={field.field} label={label} value={toTime24(draft[field.field])} onChange={(value) => onChange(field.field, value)} disabled={busy} error={error ? labels.invalid : undefined} />
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

function ParentChoice({ itemName, field, labels, disabled, onSelect, selectedValue, focusRequest, shouldFocus }: Readonly<Parameters<PendingOperationCardRenderers['parentChoice']>[0] & { selectedValue?: unknown }>) {
  const ownsFocus = useRef(false)
  const choiceRef = useRef<HTMLDivElement>(null)
  return <div ref={choiceRef} className="flex min-w-0 flex-col gap-2">
    <p className="text-sm text-[var(--fg-2)]">{labels.fieldLabels.parent_habit_id}</p>
    <RadioGroup focusRequest={focusRequest} shouldFocus={shouldFocus} aria-label={`${labels.fieldLabels.parent_habit_id}: ${itemName}`} aria-required={field.required}>
      {field.options.map((option) => <RadioRow key={JSON.stringify(option.value)} wrapLabel textMode={option.value === null ? undefined : 'personal'}
        label={option.value === null ? labels.noParent : option.label} selected={selectedValue !== undefined && selectedValue === option.value}
        onFocus={() => { ownsFocus.current = true }} onBlur={() => { ownsFocus.current = false }}
        {...(disabled ? { busy: true as const, reason: labels.acting } : { onSelect: () => onSelect(option.value, () => ownsFocus.current && (document.activeElement === document.body || choiceRef.current?.contains(document.activeElement) === true)) })} />)}
    </RadioGroup>
  </div>
}

function PlacementChoice({ itemName, placement, labels, disabled, busy, onSelect }: Readonly<Parameters<PendingOperationCardRenderers['placementChoice']>[0]>) {
  return <div className="flex min-w-0 flex-col gap-2">
    <p className="text-sm text-[var(--fg-2)]">{labels.placementRecommendation(placement)}</p>
    {placement.selected === 'checklist_item' ? <p className="text-sm text-[var(--fg-2)]">{labels.placementChecklistNote}</p> : null}
    <RadioGroup aria-label={labels.placementGroup(itemName)} className="flex min-w-0 flex-col gap-1">
      {[placement.selected, ...placement.alternatives].sort((first, second) => first.localeCompare(second)).map((value) => <RadioRow key={value}
        label={labels.placementOption(value, placement.destinationName)} wrapLabel proposed textMode={value === 'new_parent' ? undefined : 'personal'}
        description={value === placement.recommended ? labels.placementRecommended : undefined}
        selected={value === placement.selected}
        {...(busy ? { busy: true as const, reason: labels.acting } : disabled ? { disabled: true as const, reasonScope: 'group' as const } : { onSelect: () => onSelect(value) })} />)}
    </RadioGroup>
  </div>
}

const pendingOperationRenderers = {
  blockFrame: (props) => <BlockFrame {...props} items={props.items.map((item) => ({ ...item, meta: item.id === 'remaining' ? item.meta : undefined, label: typeof item.label === 'string' && item.id !== 'remaining' ? <PreviewItemTitle key={item.id} title={item.label} meta={item.meta} icon={item.icon} rename={item.rename} proposed={item.proposed} /> : item.label }))} />,
  button: ({ label, ...props }) => <PreviewButton label={label} {...props} />,
  confirmSheet: (props) => <ConfirmSheet {...props} />,
  stepUp: (props) => <div className="basis-full min-w-0"><StepUp {...props} /></div>,
  verification: (props) => <StepUpVerificationSheet {...props} />,
  editSheet: (props) => <EditPendingOperationSheet {...props} />,
  placementChoice: (props) => <PlacementChoice key={props.itemId} {...props} />,
  parentChoice: (props) => <ParentChoice key={props.itemId} {...props} />,
  removeItem: (label, disabled, onClick) => <button
    type="button" aria-label={label} disabled={disabled} onClick={onClick}
    className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full text-[var(--fg-2)] hover:bg-[var(--bg-hover)] disabled:opacity-40 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]"
  ><X aria-hidden="true" size={20} strokeWidth={1.5} /></button>,
  notice: (message) => <p role="status" className="text-sm text-[var(--fg-2)]">{message}</p>,
  rejected: (message) => <p role="status" data-preview-rejection-status="" className={message ? 'flex items-start gap-3 rounded-[12px] bg-[var(--bg-well)] p-3 text-sm text-[var(--fg-2)]' : 'sr-only'}>{message ? <><XCircle aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0 text-[var(--fg-3)]" /><span className="min-w-0 flex-1 leading-[1.55]">{message}</span></> : null}</p>,
} satisfies PendingOperationCardRenderers

function PreviewButton({ label, icon, variant, focusRequest, shouldFocus, ...props }: Readonly<import('@orbit/shared/chat').PendingOperationButtonSpec>) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const handledFocusRequest = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!focusRequest || props.disabled || handledFocusRequest.current === focusRequest) return
    handledFocusRequest.current = focusRequest
    if (shouldFocus && !shouldFocus()) return
    buttonRef.current?.focus()
  }, [focusRequest, props.disabled, shouldFocus])
  if (icon) return <IconButton label={props.accessibleName ?? label} buttonRef={buttonRef} disabled={props.disabled} loading={props.loading} hint={props.hint} onClick={props.onClick}>{icon === 'refresh' ? <RefreshCw size={20} /> : icon === 'edit' ? <Pencil size={20} /> : <X size={20} />}</IconButton>
  return <Button buttonRef={buttonRef} size="sm" variant={variant} {...props}>{label}</Button>
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
  onSendMessage,
  interaction,
}: Readonly<PendingOperationCardAdapterProps & Pick<AstraOfferProps, 'onSendMessage' | 'interaction'>>) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const { profile } = useProfile()
  const today = getAccountDay(nowDate(), profile?.timeZone)

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
    render={{ ...pendingOperationRenderers, offer: (action, unavailable) => <AstraOffer action={action} unavailable={unavailable} onSendMessage={onSendMessage} interaction={interaction} /> }}
    labels={(operation) => buildPendingOperationCardLabels(operation, t, displayTime, locale, today)}
  />
}
