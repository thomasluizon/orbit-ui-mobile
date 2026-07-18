'use client'

import {
  ArchiveX,
  CheckCircle2,
  PencilLine,
  RotateCw,
  Trash2,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { GoalActionRow } from '../goal-detail-sections'

interface GoalActionFooterProps {
  isActive: boolean
  isUpdatingStatus: boolean
  onMarkCompleted: () => void
  onMarkAbandoned: () => void
  onReactivate: () => void
  onEdit: () => void
  onDelete: () => void
}

/** Action cluster at the bottom of the goal drawer: status transitions for the
 *  current goal state plus edit and delete rows. */
export function GoalActionFooter({
  isActive,
  isUpdatingStatus,
  onMarkCompleted,
  onMarkAbandoned,
  onReactivate,
  onEdit,
  onDelete,
}: Readonly<GoalActionFooterProps>) {
  const t = useTranslations()

  return (
    <div style={{ marginTop: 16, paddingBottom: 4 }}>
      {isActive ? (
        <>
          <GoalActionRow
            label={t('goals.detail.markCompleted')}
            icon={CheckCircle2}
            onClick={onMarkCompleted}
            disabled={isUpdatingStatus}
          />
          <GoalActionRow
            label={t('goals.detail.markAbandoned')}
            icon={ArchiveX}
            onClick={onMarkAbandoned}
            disabled={isUpdatingStatus}
          />
        </>
      ) : (
        <GoalActionRow
          label={t('goals.detail.reactivate')}
          icon={RotateCw}
          onClick={onReactivate}
          disabled={isUpdatingStatus}
        />
      )}
      <GoalActionRow
        label={t('goals.detail.edit')}
        icon={PencilLine}
        onClick={onEdit}
      />
      <GoalActionRow
        label={t('goals.detail.delete')}
        icon={Trash2}
        destructive
        onClick={onDelete}
      />
    </div>
  )
}
