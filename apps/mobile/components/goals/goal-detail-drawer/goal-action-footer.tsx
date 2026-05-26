import { Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalActionFooterProps {
  isActive: boolean
  isUpdatingStatus: boolean
  onMarkCompleted: () => void
  onMarkAbandoned: () => void
  onReactivate: () => void
  onEdit: () => void
  onDelete: () => void
  styles: GoalDetailStyles
}

export function GoalActionFooter({
  isActive,
  isUpdatingStatus,
  onMarkCompleted,
  onMarkAbandoned,
  onReactivate,
  onEdit,
  onDelete,
  styles,
}: Readonly<GoalActionFooterProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.actionsRow}>
      {isActive ? (
        <>
          <TouchableOpacity
            onPress={onMarkCompleted}
            disabled={isUpdatingStatus}
            activeOpacity={0.7}
            style={styles.actionLink}
            accessibilityRole="button"
            accessibilityLabel={t('goals.detail.markCompleted')}
          >
            <Text style={styles.actionLinkText}>
              {t('goals.detail.markCompleted')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMarkAbandoned}
            disabled={isUpdatingStatus}
            activeOpacity={0.7}
            style={styles.actionLink}
            accessibilityRole="button"
            accessibilityLabel={t('goals.detail.markAbandoned')}
          >
            <Text style={styles.actionLinkTextMuted}>
              {t('goals.detail.markAbandoned')}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          onPress={onReactivate}
          disabled={isUpdatingStatus}
          activeOpacity={0.7}
          style={styles.actionLink}
          accessibilityRole="button"
          accessibilityLabel={t('goals.detail.reactivate')}
        >
          <Text style={styles.actionLinkText}>
            {t('goals.detail.reactivate')}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={onEdit}
        activeOpacity={0.7}
        style={styles.actionLink}
        accessibilityRole="button"
        accessibilityLabel={t('goals.detail.edit')}
      >
        <Text style={styles.actionLinkTextMuted}>{t('goals.detail.edit')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        activeOpacity={0.7}
        style={styles.actionLink}
        accessibilityRole="button"
        accessibilityLabel={t('goals.detail.delete')}
      >
        <Text style={styles.actionLinkTextDelete}>
          {t('goals.detail.delete')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}
