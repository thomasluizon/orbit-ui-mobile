import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import {
  CheckCircle2,
  FastForward,
  MinusCircle,
  PlusCircle,
  Trash2,
  X,
} from 'lucide-react-native'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface BulkActionBarV2Props {
  count: number
  allSelected: boolean
  onSelectAll: () => void
  onDeselectAll: () => void
  onLog: () => void
  onSkip: () => void
  onDelete: () => void
  onClose: () => void
  countLabel: string
  selectAllLabel: string
  deselectAllLabel: string
  logLabel: string
  skipLabel: string
  deleteLabel: string
  closeLabel: string
}

/**
 * Floating bulk action toolbar on an elevated solid sheet surface, shown when
 * select mode is active. Pinned to the bottom by the parent screen; this
 * primitive lays out the count caption and the action buttons.
 */
export function BulkActionBarV2({
  count,
  allSelected,
  onSelectAll,
  onDeselectAll,
  onLog,
  onSkip,
  onDelete,
  onClose,
  countLabel,
  selectAllLabel,
  deselectAllLabel,
  logLabel,
  skipLabel,
  deleteLabel,
  closeLabel,
}: Readonly<BulkActionBarV2Props>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const disabled = count === 0

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: tokens.bgSheet,
          borderColor: tokens.hairline,
        },
        shadowsV2.shadow2,
      ]}
    >
      <Text style={[styles.count, { color: tokens.fg1 }]}>
        {countLabel}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={allSelected ? deselectAllLabel : selectAllLabel}
          onPress={allSelected ? onDeselectAll : onSelectAll}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
          ]}
        >
          {allSelected ? (
            <MinusCircle size={18} color={tokens.fg2} strokeWidth={1.8} />
          ) : (
            <PlusCircle size={18} color={tokens.fg2} strokeWidth={1.8} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={logLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onLog}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            disabled ? styles.disabled : null,
          ]}
        >
          <CheckCircle2
            size={18}
            color={tokens.primary}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            disabled ? styles.disabled : null,
          ]}
        >
          <FastForward
            size={18}
            color={tokens.statusSkip}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            disabled ? styles.disabled : null,
          ]}
        >
          <Trash2
            size={18}
            color={tokens.statusBad}
            strokeWidth={1.8}
          />
        </Pressable>
        <View
          style={[styles.divider, { backgroundColor: tokens.hairline }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
          ]}
        >
          <X size={18} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  count: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 2,
  },
})
