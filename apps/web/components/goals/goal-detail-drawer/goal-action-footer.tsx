'use client'

import {
  ArchiveX,
  PencilLine,
  RotateCw,
  Trash2,
} from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'

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
      <ListRow
        title={t('goals.detail.edit')}
        icon={<PencilLine size={24} strokeWidth={1.5} aria-hidden="true" />}
        chevron={false}
        onClick={onEdit}
      />
      {isAbandoned ? (
        <ListRow
          title={t('goals.detail.reactivate')}
          icon={<RotateCw size={24} strokeWidth={1.5} aria-hidden="true" />}
          chevron={false}
          onClick={onReactivate}
          disabled={isUpdatingStatus}
        />
      ) : null}
      {isActive ? (
          <ListRow
            title={t('goals.detail.markAbandoned')}
            icon={<ArchiveX size={24} strokeWidth={1.5} aria-hidden="true" />}
            chevron={false}
            onClick={onMarkAbandoned}
            disabled={isUpdatingStatus}
          />
      ) : null}
      <ListRow
        title={t('goals.detail.delete')}
        icon={<Trash2 size={24} strokeWidth={1.5} aria-hidden="true" />}
        danger
        chevron={false}
        onClick={onDelete}
      />
    </div>
  )
}
