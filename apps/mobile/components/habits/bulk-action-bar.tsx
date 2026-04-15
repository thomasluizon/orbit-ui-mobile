import { View, Text, Pressable, StyleSheet } from 'react-native'
import {
  X,
  CheckCircle,
  MinusCircle,
  PlusCircle,
  Forward,
  Trash2,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * Mobile parity port of `apps/web/components/habits/bulk-action-bar.tsx`.
 *
 * Floats above the habit list in select mode and exposes the same
 * `Select all / Log all / Skip all / Delete all / Cancel` action set.
 * Behaviour and i18n keys mirror the web implementation 1:1.
 */
export interface BulkActionBarProps {
  selectedCount: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onBulkLog: () => void
  onBulkSkip: () => void
  onBulkDelete: () => void
  onCancel: () => void
}

export function BulkActionBar({
  selectedCount,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onBulkLog,
  onBulkSkip,
  onBulkDelete,
  onCancel,
}: BulkActionBarProps) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()

  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, {
        backgroundColor: colors.surfaceOverlay,
        borderColor: colors.borderMuted,
      }]}
    >
      <Text
        style={[styles.label, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {t('common.selected', { n: selectedCount })}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={allSelected ? t('common.deselectAll') : t('common.selectAll')}
          onPress={() => (allSelected ? onDeselectAll() : onSelectAll())}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          {allSelected ? (
            <MinusCircle size={20} color={colors.textSecondary} />
          ) : (
            <PlusCircle size={20} color={colors.textSecondary} />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel={t('habits.logHabit')}
          onPress={onBulkLog}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <CheckCircle size={20} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityLabel={t('habits.skipHabit')}
          onPress={onBulkSkip}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <Forward size={20} color={colors.amber400} />
        </Pressable>
        <Pressable
          accessibilityLabel={t('common.delete')}
          onPress={onBulkDelete}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <Trash2 size={20} color={colors.red400} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          accessibilityLabel={t('common.cancel')}
          onPress={onCancel}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.btnPressed]}
        >
          <X size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 96,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 12,
  },
  btnPressed: {
    opacity: 0.6,
  },
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
})
