import { SPACING } from '@orbit/shared/theme'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  ArchiveX,
  PencilLine,
  RotateCw,
  Trash2,
} from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
interface GoalActionFooterProps {
  isActive: boolean
  isAbandoned: boolean
  isUpdatingStatus: boolean
  defaultIconColor: string
  iconColor: string
  onMarkAbandoned: () => void
  onReactivate: () => void
  onEdit: () => void
  onDelete: () => void
}

export function GoalActionFooter({
  isActive,
  isAbandoned,
  isUpdatingStatus,
  defaultIconColor,
  iconColor,
  onMarkAbandoned,
  onReactivate,
  onEdit,
  onDelete,
}: Readonly<GoalActionFooterProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.actions}>
      <ListRow
        compact={false}
        title={t('goals.detail.edit')}
        accessibilityLabel={t('goals.detail.edit')}
        icon={<PencilLine size={24} strokeWidth={1.5} color={defaultIconColor} />}
        chevron={false}
        onClick={onEdit}
      />
      {isAbandoned ? (
        <ListRow
          compact={false}
          title={t('goals.detail.reactivate')}
          accessibilityLabel={t('goals.detail.reactivate')}
          icon={<RotateCw size={24} strokeWidth={1.5} color={defaultIconColor} />}
          chevron={false}
          onClick={onReactivate}
          disabled={isUpdatingStatus}
        />
      ) : null}
      {isActive ? (
        <ListRow
          compact={false}
          title={t('goals.detail.markAbandoned')}
          accessibilityLabel={t('goals.detail.markAbandoned')}
          icon={<ArchiveX size={24} strokeWidth={1.5} color={defaultIconColor} />}
          chevron={false}
          onClick={onMarkAbandoned}
          disabled={isUpdatingStatus}
        />
      ) : null}
      <ListRow
        compact={false}
        title={t('goals.detail.delete')}
        accessibilityLabel={t('goals.detail.delete')}
        icon={<Trash2 size={24} strokeWidth={1.5} color={iconColor} />}
        danger
        chevron={false}
        onClick={onDelete}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  actions: { paddingBottom: SPACING.s4 },
})
