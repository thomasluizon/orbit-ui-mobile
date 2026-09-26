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
import { isPendingOperationEditableField } from '@orbit/shared/hooks'
import { X } from '@/components/ui/icons'
import { useEffect, useState } from 'react'
import { RadioRow } from '@/components/ui/select-check'


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
  pendingOperationId,
  prepared,
  onClose,
  onCompleted,
  onVerify,
}: Readonly<PendingOperationVerificationProps>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const completed = (status: 'done' | 'failed') => closeSheet(() => onCompleted(status))
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
      onClose={onClose}
      actions={<>
        <Button size="sm" variant="ghost" onClick={() => closeSheet()}>{t('common.cancel')}</Button>
        <Button size="sm" loading={verifying} disabled={code.length !== 6} onClick={() => void verify()}>{t('stepUp.confirm')}</Button>
      </>}
    >
      <OtpInput label={t('stepUp.codeLabel')} value={code} onChange={setCode} error={error} hint={t('stepUp.codeHint')} disabled={verifying} />
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
} satisfies PendingOperationCardRenderers

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onRevise,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardAdapterProps>) {
  const t = useTranslations()

  return <SharedPendingOperationCard
    pendingOperation={pendingOperation}
    onConfirmExecute={onConfirmExecute}
    onRevise={onRevise}
    onPrepareStepUp={onPrepareStepUp}
    onVerifyStepUp={onVerifyStepUp}
    render={pendingOperationRenderers}
    labels={buildPendingOperationCardLabels(pendingOperation, t)}
  />
}
