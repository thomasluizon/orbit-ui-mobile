import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { buildActionChipsModel, resolveActionChipText } from '@orbit/shared/chat'
import type { ActionResult } from '@orbit/shared/types/chat'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConflictWarning } from './conflict-warning'

interface ActionChipsProps {
  actions: ActionResult[]
  onChipClick?: (entityId: string, actionType: string) => void
}

export function ActionChips({ actions, onChipClick }: Readonly<ActionChipsProps>) {
  const { t, i18n } = useTranslation()
  const model = buildActionChipsModel(actions, Boolean(onChipClick))
  const rows = model.rows.flatMap((row) => {
    const text = resolveActionChipText(row, { translate: t, has: (key) => i18n.exists(key) })
    return text ? [{ ...row, ...text }] : []
  })
  if (rows.length === 0) return null

  return (
    <BlockFrame
      state={model.state}
      title={t('chat.action.changes')}
      items={rows.map((row) => {
        const navigation = row.navigation
        return {
          id: row.id,
          label: row.personal ? <PersonalTextDetails outset>{row.label}</PersonalTextDetails> : row.label,
          wrapLabel: row.wrapLabel,
          meta: row.status === 'failed' ? t('chat.operation.status.Failed') : undefined,
          status: row.status,
          control: navigation.navigable ? (
            <Button size="sm" variant="ghost" onClick={() => onChipClick?.(navigation.entityId, navigation.actionType)}>
              {t('chat.action.open')}
            </Button>
          ) : undefined,
        }
      })}
      body={model.conflicts.length > 0 ? <View style={{ gap: 12 }}>{model.conflicts.map((conflict) => (
        <ConflictWarning key={conflict.key} warning={conflict.warning} />
      ))}</View> : undefined}
    />
  )
}
