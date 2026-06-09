import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  ArchiveX,
  CheckCircle2,
  PencilLine,
  RotateCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native'
import type { createStyles } from './styles'

type GoalDetailStyles = ReturnType<typeof createStyles>

interface GoalActionRowProps {
  label: string
  icon: LucideIcon
  iconColor: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
  styles: GoalDetailStyles
}

function GoalActionRow({
  label,
  icon: Icon,
  iconColor,
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
      <Icon size={16} strokeWidth={1.7} color={iconColor} />
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
  iconColor: string
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
  iconColor,
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
            icon={CheckCircle2}
            iconColor={iconColor}
            onPress={onMarkCompleted}
            disabled={isUpdatingStatus}
            styles={styles}
          />
          <GoalActionRow
            label={t('goals.detail.markAbandoned')}
            icon={ArchiveX}
            iconColor={iconColor}
            onPress={onMarkAbandoned}
            disabled={isUpdatingStatus}
            styles={styles}
          />
        </>
      ) : (
        <GoalActionRow
          label={t('goals.detail.reactivate')}
          icon={RotateCw}
          iconColor={iconColor}
          onPress={onReactivate}
          disabled={isUpdatingStatus}
          styles={styles}
        />
      )}
      <GoalActionRow
        label={t('goals.detail.edit')}
        icon={PencilLine}
        iconColor={iconColor}
        onPress={onEdit}
        styles={styles}
      />
      <GoalActionRow
        label={t('goals.detail.delete')}
        icon={Trash2}
        iconColor={iconColor}
        destructive
        onPress={onDelete}
        styles={styles}
      />
    </View>
  )
}
