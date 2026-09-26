import { SharedPendingOperationCard, type PendingOperationCardAdapterProps, type PendingOperationCardRenderers, type PendingOperationVerificationProps } from './shared-pending-operation-card'
import { buildPendingOperationCardLabels, PENDING_OPERATION_WEEKDAYS, type PendingOperationEditSheetProps } from '@orbit/shared/chat'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
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
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { useEffect, useState } from 'react'
import { RadioRow } from '@/components/ui/select-check'

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
    <View style={{ gap: 16 }}>
      {items.length > 1 ? <View style={{ gap: 8 }}><Input label={labels.search} value={query} onChange={setQuery} disabled={busy} /><ScrollView style={{ maxHeight: 192 }}>{items.filter((entry) => entry.fields.some(isPendingOperationEditableField) && entry.entityName.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((entry) =>
        busy
          ? <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} disabled reason={labels.acting} />
          : <RadioRow key={entry.itemId} label={entry.entityName} selected={entry.itemId === item.itemId} onSelect={() => onSelectItem(entry.itemId)} />)}</ScrollView></View> : null}
      {item.fields.filter(isPendingOperationEditableField).map((field) => {
        const label = labels.fieldLabels[field.field] ?? field.field
        if (field.valueType === 'boolean') return <View key={field.field} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text>{label}</Text><Switch label={label} checked={draft[field.field] === 'true'} disabled={busy} onChange={(value) => onChange(field.field, String(value))} /></View>
        if (field.field === 'days') {
          const days = (draft.days ?? '').split(',').map((day) => day.trim())
          return <View key={field.field} style={{ gap: 8 }}><Text>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PENDING_OPERATION_WEEKDAYS.map((day) => <Pressable key={day} accessibilityRole="button" accessibilityState={{ selected: days.includes(day), disabled: busy }} disabled={busy} onPress={() => onChange('days', PENDING_OPERATION_WEEKDAYS.filter((name) => name === day ? !days.includes(name) : days.includes(name)).join(', '))} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: days.includes(day) ? tokens.primary : tokens.hairlineStrong, backgroundColor: days.includes(day) ? tokens.bgHover : 'transparent' }}><Text>{labels.dayLabels[day]}</Text></Pressable>)}</View></View>
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
      {error && item.fields.every((field) => field.valueType === 'action' || field.valueType === 'boolean' || field.field === 'days') ? <Text accessibilityRole="alert">{labels.invalid}</Text> : null}
    </View>
  </Sheet>
}

function StepUpVerificationSheet({
  pendingOperationId,
  prepared,
  onClose,
  onCompleted,
  onVerify,
}: Readonly<PendingOperationVerificationProps>) {
  const { t } = useTranslation()
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
      <Text>{t('stepUp.neverShare')}</Text>
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
  removeItem: (label, disabled, onClick) => <RemoveItemButton label={label} disabled={disabled} onClick={onClick} />,
  notice: (message) => <Text accessibilityRole="text">{message}</Text>,
  actionRow: (...children) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>{children}</View>,
} satisfies PendingOperationCardRenderers

export function PendingOperationCard({
  pendingOperation,
  onConfirmExecute,
  onRevise,
  onPrepareStepUp,
  onVerifyStepUp,
}: Readonly<PendingOperationCardAdapterProps>) {
  const { t } = useTranslation()

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
