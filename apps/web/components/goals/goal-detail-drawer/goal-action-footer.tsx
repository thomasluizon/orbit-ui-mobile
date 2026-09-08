'use client'

import {
  ArchiveX,
  PencilLine,
  RotateCw,
  Trash2,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { GoalActionRow } from '../goal-detail-sections'

interface GoalActionFooterProps {
  isActive: boolean
  isAbandoned: boolean
  isUpdatingStatus: boolean
  onMarkAbandoned: () => void
  onReactivate: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Action cluster at the bottom of the goal drawer: status transitions for the
 *  current goal state plus edit and delete rows. */
export function GoalActionFooter({
  isActive,
  isAbandoned,
  isUpdatingStatus,
  onMarkAbandoned,
  onReactivate,
  onEdit,
  onDelete,
}: Readonly<GoalActionFooterProps>) {
  const t = useTranslations()

  return (
    <div style={{ paddingBottom: 4 }}>
      <GoalActionRow
        label={t('goals.detail.edit')}
        icon={PencilLine}
        onClick={onEdit}
      />
      {isAbandoned ? (
        <GoalActionRow
          label={t('goals.detail.reactivate')}
          icon={RotateCw}
          onClick={onReactivate}
          disabled={isUpdatingStatus}
        />
      ) : null}
      {isActive ? (
          <GoalActionRow
            label={t('goals.detail.markAbandoned')}
            icon={ArchiveX}
            onClick={onMarkAbandoned}
            disabled={isUpdatingStatus}
          />
      ) : null}
      <GoalActionRow
        label={t('goals.detail.delete')}
        icon={Trash2}
        destructive
        onClick={onDelete}
      />
    </div>
  )
}
