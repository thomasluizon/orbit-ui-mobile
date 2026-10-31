import { SECONDARY_TEXT_SIZE } from '@orbit/shared/theme'
import { toTime24 } from '@orbit/shared/utils'
import { Text, View } from 'react-native'
import { previewFieldInputs, changePreviewFieldInput, previewFieldInputLabel } from '@orbit/shared/hooks'
import type { PendingOperationCardLabels } from '@orbit/shared/chat'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { TimeField } from '@/components/ui/time-field'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function StructuredPreviewField({ field, value, proposedValue, labels, busy, error, onChange }: Readonly<{
  field: string; value: string; proposedValue: unknown; labels: PendingOperationCardLabels; busy: boolean; error?: string
  onChange: (value: string) => void
}>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={{ minWidth: 0, gap: 12 }}>
    <Text style={{ color: tokens.fg2, fontSize: SECONDARY_TEXT_SIZE }}>{labels.fieldLabels[field.split('/').at(-1)!] ?? field}</Text>
    {previewFieldInputs(value, field, proposedValue).map(input => {
      const key = JSON.stringify(input.path)
      const name = previewFieldInputLabel(input, labels.fieldLabels)
      const change = (next: string | boolean) => onChange(changePreviewFieldInput(value, input, next))
      if (input.kind === 'boolean') return <Switch key={key} label={name} checked={input.value === true} onChange={change} disabled={busy} />
      if (input.kind === 'time') return <TimeField key={key} label={name} value={toTime24(String(input.value))} onChange={change} onClear={() => change('')} disabled={busy} error={error ? labels.invalid : undefined} />
      return <Input key={key} label={name} value={String(input.value)} onChange={change} disabled={busy} kind={input.kind === 'number' ? 'number' : undefined} error={error ? labels.invalid : undefined} />
    })}
  </View>
}
