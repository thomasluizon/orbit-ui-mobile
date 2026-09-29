import { SharedPendingOperationCard, type PendingOperationCardAdapterProps, type PendingOperationCardRenderers, type PendingOperationVerificationProps } from './shared-pending-operation-card'
import { buildPendingOperationCardLabels, PENDING_OPERATION_ITEM_SEARCH_THRESHOLD, PENDING_OPERATION_WEEKDAYS, type PendingOperationEditSheetProps } from '@orbit/shared/chat'
import { useTranslation } from 'react-i18next'
import { I18nManager, Pressable, Text, View } from 'react-native'
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
import { ArrowRight, X } from '@/components/ui/icons'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
    <RadioGroup accessibilityLabel={`${rowLabel}: ${labels.reminderWhen}`}>
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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const fieldLabel = labels.fieldLabels[field] ?? field
  const rows = pendingOperationListRows(value)
  const limit = field === 'checklist_items' ? MAX_CHECKLIST_ITEMS : field === 'scheduled_reminders' ? MAX_SCHEDULED_REMINDERS : undefined
  const atLimit = limit !== undefined && rows.length >= limit
  return <View style={{ gap: 12 }}>
    <Text style={{ color: tokens.fg1 }}>{fieldLabel}</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText }}>{labels.invalid}</Text> : null}
    {rows.map((entry, index) => {
      const row = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { value: entry }
      const rowLabel = `${fieldLabel} ${index + 1}`
      return <View key={`${field}-${index}`} style={{ gap: 8 }}>
        <View style={{ alignItems: 'flex-end' }}><RemoveItemButton label={`${labels.remove} ${rowLabel}`} disabled={busy} onClick={() => onChange(removePendingOperationListRow(value, index))} /></View>
        <ListRowFields field={field} row={row} rowLabel={rowLabel} labels={labels} busy={busy} change={(key, next) => onChange(changePendingOperationListRow(value, index, key, next))} />
      </View>
    })}
    <Button size="sm" variant="ghost" disabled={busy || atLimit} onClick={() => onChange(addPendingOperationListRow(value, field))}>{labels.addListRow}</Button>
    {atLimit ? <Text style={{ color: tokens.fg2 }}>{field === 'checklist_items' ? labels.checklistLimit : labels.scheduledLimit}</Text> : null}
  </View>
}

function RemoveItemButton({ label, disabled, onClick }: Readonly<{ label: string; disabled: boolean; onClick: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Pressable
    accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onClick}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
  ><X accessible={false} color={tokens.fg2} size={20} strokeWidth={1.5} /></Pressable>
}


function EditPendingOperationSheet({ item, items, draft, labels, busy, stale, error, onSelectItem, onChange, onClose, onSave }: Readonly<PendingOperationEditSheetProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const [query, setQuery] = useState('')
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const editableItems = items.filter((entry) => entry.fields.some(isPendingOperationEditableField))
  const showSearch = editableItems.length > PENDING_OPERATION_ITEM_SEARCH_THRESHOLD
  useEffect(() => { if (stale) closeSheet(onClose, onClose) }, [stale, closeSheet, onClose])
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
    <View style={{ gap: 16 }}>
      {editableItems.length > 1 ? <View style={{ gap: 8 }}>{showSearch ? <Input label={labels.search} value={query} onChange={setQuery} disabled={busy} /> : null}<View>{editableItems.filter((entry) => !showSearch || entry.entityName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) =>
        busy
          ? <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} disabled reason={labels.acting} />
          : <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} onSelect={() => onSelectItem(entry.itemId)} />)}</View></View> : null}
      {item.fields.filter(isPendingOperationEditableField).map((field) => {
        const label = labels.fieldLabels[field.field] ?? field.field
        if (field.field === 'checklist_items' || field.field === 'reminder_times' || field.field === 'scheduled_reminders') return <ListFieldEditor key={field.field} field={field.field} value={draft[field.field] ?? '[]'} labels={labels} busy={busy} error={error} onChange={(value) => onChange(field.field, value)} />
        if (field.valueType === 'boolean') return <View key={field.field} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: tokens.fg1 }}>{label}</Text><Switch label={label} checked={draft[field.field] === 'true'} disabled={busy} onChange={(value) => onChange(field.field, String(value))} /></View>
        if (field.field === 'days') {
          const days = (draft.days ?? '').split(',').map((day) => day.trim())
          return <View key={field.field} style={{ gap: 8 }}><Text style={{ color: tokens.fg1 }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PENDING_OPERATION_WEEKDAYS.map((day) => <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: days.includes(day), disabled: busy }} disabled={busy} onPress={() => onChange('days', PENDING_OPERATION_WEEKDAYS.filter((name) => name === day ? !days.includes(name) : days.includes(name)).join(', '))} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: days.includes(day) ? tokens.primary : tokens.hairlineStrong, backgroundColor: days.includes(day) ? tokens.bgHover : 'transparent' }}><Text style={{ color: tokens.fg1 }}>{labels.dayLabels[day]}</Text></Pressable>)}</View></View>
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
      {error && item.fields.every((field) => field.valueType === 'action' || field.valueType === 'boolean' || field.field === 'days') ? <Text accessibilityRole="alert" style={{ color: tokens.statusBadText }}>{labels.invalid}</Text> : null}
    </View>
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
  const { t } = useTranslation()
  const { sheetRef, closeSheet } = useSheetHost()
  const openRef = useRef(open)
  useLayoutEffect(() => { openRef.current = open }, [open])
  useEffect(() => {
    if (!open) closeSheet(onClosed, onClosed)
  }, [open, onClosed, closeSheet])
  const completed: PendingOperationVerificationProps['onCompleted'] = (result) => {
    if (openRef.current) closeSheet(() => onCompleted(result), () => onCompleted(result))
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
      <Text>{t('stepUp.neverShare')}</Text>
    </Sheet>
  )
}

const pendingOperationRenderers = {
  blockFrame: (props) => <BlockFrame {...props} />,
  button: ({ label, ...props }) => <Button size="sm" {...props}>{label}</Button>,
  confirmSheet: (props) => <ConfirmSheet {...props} />,
  stepUp: (props) => <StepUp {...props} />,
  verification: (props) => <StepUpVerificationSheet {...props} />,
  editSheet: (props) => <EditPendingOperationSheet {...props} />,
  removeItem: (label, disabled, onClick) => <RemoveItemButton label={label} disabled={disabled} onClick={onClick} />,
  notice: (message) => <Text accessibilityRole="text">{message}</Text>,
  actionRow: (...children) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{children}</View>,
  diffLabel: (field, oldValue, newValue, accessible) => <DiffLabel field={field} oldValue={oldValue} newValue={newValue} accessible={accessible} />,
} satisfies PendingOperationCardRenderers

function DiffLabel({ field, oldValue, newValue, accessible }: Readonly<{ field: string; oldValue: string; newValue: string; accessible: string }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View accessible accessibilityLabel={accessible} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
    <Text style={{ color: tokens.fg1, fontSize: 14 }}>{field}:</Text>
    <Text style={{ color: tokens.fg3, fontSize: 14 }}>{oldValue}</Text>
    <ArrowRight accessible={false} color={tokens.fg2} size={16} strokeWidth={1.5} style={I18nManager.isRTL ? { transform: [{ rotate: '180deg' }] } : undefined} />
    <Text style={{ color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 }}>{newValue}</Text>
  </View>
}

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onRevise,
  onRefresh,
  onOpenTarget,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardAdapterProps>) {
  const { t } = useTranslation()

  return <SharedPendingOperationCard
    pendingOperation={pendingOperation}
    onConfirmExecute={onConfirmExecute}
    onRevise={onRevise}
    onRefresh={onRefresh}
    onOpenTarget={onOpenTarget}
    onPrepareStepUp={onPrepareStepUp}
    onVerifyStepUp={onVerifyStepUp}
    render={pendingOperationRenderers}
    labels={buildPendingOperationCardLabels(pendingOperation, t)}
  />
}
