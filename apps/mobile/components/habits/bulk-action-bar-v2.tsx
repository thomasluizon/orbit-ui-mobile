import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import { CheckCircle2, FastForward, Trash2, X } from '@/components/ui/icons'
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
  countSuffixLabel: string
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
  countSuffixLabel,
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
      <View style={styles.captionRow}>
        <Text style={[styles.countLine, { color: tokens.fg3 }]}>
          <Text
            style={[styles.countValue, { color: tokens.fg1 }]}
          >
            {count}
          </Text>
          {' '}
          {countSuffixLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={allSelected ? onDeselectAll : onSelectAll}
          hitSlop={{ top: 11, bottom: 11, left: 6, right: 6 }}
          style={({ pressed }) => [
            styles.selectAllBtn,
            pressed ? styles.pressedScale : null,
          ]}
        >
          <Text style={[styles.selectAllText, { color: tokens.fg3 }]}>
            {allSelected ? deselectAllLabel : selectAllLabel}
          </Text>
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={logLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={2}
          onPress={onLog}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            pressed ? styles.pressedScale : null,
            disabled ? styles.disabled : null,
          ]}
        >
          <CheckCircle2
            size={22}
            color={tokens.primary}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={2}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            pressed ? styles.pressedScale : null,
            disabled ? styles.disabled : null,
          ]}
        >
          <FastForward
            size={22}
            color={tokens.statusSkip}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={2}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            pressed ? styles.pressedScale : null,
            disabled ? styles.disabled : null,
          ]}
        >
          <Trash2
            size={22}
            color={tokens.statusBad}
            strokeWidth={1.8}
          />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={2}
          onPress={onClose}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgSunk : 'transparent' },
            pressed ? styles.pressedScale : null,
          ]}
        >
          <X size={22} color={tokens.fg2} strokeWidth={1.8} />
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
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  countLine: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    letterSpacing: 0.24,
  },
  countValue: {
    fontFamily: 'Roboto_500Medium',
    fontVariant: ['tabular-nums'],
  },
  selectAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  selectAllText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 12,
    textDecorationLine: 'underline',
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
  pressedScale: {
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.45,
  },
  spacer: {
    flex: 1,
  },
})
