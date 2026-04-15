import { View, Text, Pressable, StyleSheet, Modal, TouchableWithoutFeedback } from 'react-native'
import {
  X,
  CheckCircle,
  Eye,
  Check,
  RefreshCw,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * Mobile parity port of `apps/web/components/habits/controls-menu.tsx`.
 *
 * Web shows this as a popover anchored to the More-Vertical button.
 * Mobile uses a centered Modal sheet for the same set of controls
 * (Select / Collapse / Refresh / Show completed). i18n keys mirror web.
 */
export interface ControlsMenuProps {
  open: boolean
  isSelectMode: boolean
  showCompleted: boolean
  isFetching: boolean
  allCollapsed: boolean
  onToggleSelect: () => void
  onToggleCollapse: () => void
  onRefresh: () => void
  onToggleCompleted: () => void
  onClose: () => void
}

export function ControlsMenu({
  open,
  isSelectMode,
  showCompleted,
  isFetching,
  allCollapsed,
  onToggleSelect,
  onToggleCollapse,
  onRefresh,
  onToggleCompleted,
  onClose,
}: ControlsMenuProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.menu, { backgroundColor: colors.surfaceOverlay, borderColor: colors.borderMuted }]}>
              <MenuItem
                icon={isSelectMode ? <X size={16} color={colors.textMuted} /> : <CheckCircle size={16} color={colors.textMuted} />}
                label={isSelectMode ? t('common.cancel') : t('common.select')}
                onPress={() => { onToggleSelect(); onClose() }}
                colors={colors}
              />
              <MenuItem
                icon={allCollapsed ? <ChevronsUpDown size={16} color={colors.textMuted} /> : <ChevronsDownUp size={16} color={colors.textMuted} />}
                label={allCollapsed ? t('habits.expandAll') : t('habits.collapseAll')}
                onPress={() => { onToggleCollapse(); onClose() }}
                colors={colors}
              />
              <MenuItem
                icon={<RefreshCw size={16} color={colors.textMuted} />}
                label={t('habits.refresh')}
                disabled={isFetching}
                onPress={() => { onRefresh(); onClose() }}
                colors={colors}
              />
              <MenuItem
                icon={showCompleted ? <Check size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                label={t('habits.showCompleted')}
                onPress={() => { onToggleCompleted(); onClose() }}
                colors={colors}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

function MenuItem({
  icon,
  label,
  disabled,
  onPress,
  colors,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onPress: () => void
  colors: ReturnType<typeof useAppTheme>['colors']
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.item,
        pressed && { backgroundColor: colors.surface },
        disabled && { opacity: 0.5 },
      ]}
    >
      {icon}
      <Text style={[styles.itemText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menu: {
    minWidth: 220,
    borderRadius: 16,
    borderWidth: 1,
    padding: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  itemText: {
    fontSize: 14,
  },
})
