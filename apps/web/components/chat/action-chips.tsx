'use client'

import { useTranslations } from 'next-intl'
import { buildActionChipsModel } from '@orbit/shared/chat'
import type { ActionResult } from '@orbit/shared/types/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { Button } from '@/components/ui/pill-button'
import { ConflictWarning } from './conflict-warning'

interface ActionChipsProps {
  actions: ActionResult[]
  onChipClick?: (entityId: string, actionType: string) => void
}

export function ActionChips({ actions, onChipClick }: Readonly<ActionChipsProps>) {
  const t = useTranslations()
  const model = buildActionChipsModel(actions, Boolean(onChipClick))
  if (model.rows.length === 0) return null

  return (
    <BlockFrame
      state={model.state}
      title={t('chat.action.changes')}
      items={model.rows.map((row) => {
        const navigation = row.navigation
        const entityName = row.entityName || (row.status === 'failed' ? undefined : t('chat.unknownEntity'))
        return {
          id: row.id,
          label: row.labelKey
            ? entityName ? t(row.labelKey, { name: entityName }) : t(row.labelKey)
            : t('chat.action.completed'),
          meta: row.status === 'failed' ? t('chat.operation.status.Failed') : undefined,
          status: row.status,
          control: navigation.navigable ? (
            <Button size="sm" variant="ghost" onClick={() => onChipClick?.(navigation.entityId, navigation.actionType)}>
              {t('chat.action.open')}
            </Button>
          ) : undefined,
        }
      })}
      actions={model.conflicts.length > 0 ? model.conflicts.map((conflict) => (
        <ConflictWarning key={conflict.key} warning={conflict.warning} />
      )) : undefined}
    />
  )
}
