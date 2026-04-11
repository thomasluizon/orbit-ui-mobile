import type { ReactElement } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Trash2, Pencil, Copy, SkipForward, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitActionsSheetProps {
  visible: boolean
  canSkip?: boolean
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
  onSkip?: () => void
  onDelete: () => void
}

/**
 * Bottom sheet that opens on swipe-left for a habit row. Lightweight modal
 * with the main row actions.
 */
export function HabitActionsSheet({
  visible,
  canSkip,
  onClose,
  onEdit,
  onDuplicate,
  onSkip,
  onDelete,
}: Readonly<HabitActionsSheetProps>) {
  const { t } = useTranslation()
  const { colors, radius } = useAppTheme()

  const items: Array<{
    icon: ReactElement
    label: string
    onPress: () => void
    destructive?: boolean
    disabled?: boolean
  }> = [
    {
      icon: <Pencil size={18} color={colors.textPrimary} />,
      label: t('common.edit'),
      onPress: () => {
        onClose()
        onEdit()
      },
    },
    {
      icon: <Copy size={18} color={colors.textPrimary} />,
      label: t('common.duplicate'),
      onPress: () => {
        onClose()
        onDuplicate()
      },
    },
  ]

  if (canSkip && onSkip) {
    items.push({
      icon: <SkipForward size={18} color={colors.textPrimary} />,
      label: t('habits.skip'),
      onPress: () => {
        onClose()
        onSkip()
      },
    })
  }

  items.push({
    icon: <Trash2 size={18} color={colors.red400} />,
    label: t('common.delete'),
    destructive: true,
    onPress: () => {
      onClose()
      onDelete()
    },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t('habits.card.menuAction')}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              disabled={item.disabled}
              style={[styles.item, { borderColor: colors.borderMuted ?? colors.border }]}
              activeOpacity={0.7}
            >
              {item.icon}
              <Text
                style={[
                  styles.itemLabel,
                  { color: item.destructive ? colors.red400 : colors.textPrimary },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    padding: 16,
    paddingBottom: 32,
    gap: 6,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
})
