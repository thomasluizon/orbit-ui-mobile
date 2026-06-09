import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalActionRowProps {
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
  styles: GoalDetailStyles
}

function GoalActionRow({
  label,
  onPress,
  disabled = false,
  destructive = false,
  styles,
}: Readonly<GoalActionRowProps>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && !disabled ? styles.actionRowPressed : null,
        disabled ? { opacity: 0.5 } : null,
      ]}
    >
      <Text
        style={destructive ? styles.actionRowTextDestructive : styles.actionRowText}
      >
        {label}
      </Text>
    </Pressable>
  )
}

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
    <View style={styles.actions}>
      {isActive ? (
        <>
          <GoalActionRow
            label={t('goals.detail.markCompleted')}
            onPress={onMarkCompleted}
            disabled={isUpdatingStatus}
            styles={styles}
          />
          <GoalActionRow
            label={t('goals.detail.markAbandoned')}
            onPress={onMarkAbandoned}
            disabled={isUpdatingStatus}
            styles={styles}
          />
        </>
      ) : (
        <GoalActionRow
          label={t('goals.detail.reactivate')}
          onPress={onReactivate}
          disabled={isUpdatingStatus}
          styles={styles}
        />
      )}
      <GoalActionRow
        label={t('goals.detail.edit')}
        onPress={onEdit}
        styles={styles}
      />
      <GoalActionRow
        label={t('goals.detail.delete')}
        onPress={onDelete}
        destructive
        styles={styles}
      />
    </View>
  )
}
