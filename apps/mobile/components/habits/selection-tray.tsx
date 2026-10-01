import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import { CheckCircle2, FastForward, Trash2, X } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePrefersReducedMotion } from '@/lib/motion'

interface SelectionTrayProps {
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
  completionReadOnly?: boolean
  completionReason?: string
}

/**
 * Bulk actions on a solid sheet surface, rendered in the shell composer slot
 * while select mode is active.
 */
export function SelectionTray({
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
  completionReadOnly = false,
  completionReason,
}: Readonly<SelectionTrayProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const disabled = count === 0
  const completionDisabled = disabled || completionReadOnly

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: tokens.bgSheet,
          borderColor: tokens.hairline,
        },
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
          style={({ pressed }) => [
            styles.selectAllBtn,
            pressed && !prefersReducedMotion ? styles.pressedScale : null,
          ]}
        >
          {({ pressed }) => (
            <>
              <View
                testID="selection-all-fill"
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
                style={[styles.selectAllFill, { backgroundColor: tokens.bgHoverOpaque, opacity: pressed ? 1 : 0 }]}
              />
              <Text style={[styles.selectAllText, { color: pressed ? tokens.fg1 : tokens.fg2 }]}>
                {allSelected ? deselectAllLabel : selectAllLabel}
              </Text>
            </>
          )}
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={logLabel}
          accessibilityHint={completionReadOnly ? completionReason : undefined}
          accessibilityState={{ disabled: completionDisabled }}
          disabled={completionDisabled}
          onPress={onLog}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed && !completionDisabled ? tokens.bgHoverOpaque : 'transparent' },
            pressed && !completionDisabled && !prefersReducedMotion ? styles.pressedScale : null,
            completionDisabled ? styles.disabled : null,
          ]}
        >
          <CheckCircle2
            size={20}
            color={tokens.fg1}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={skipLabel}
          accessibilityHint={completionReadOnly ? completionReason : undefined}
          accessibilityState={{ disabled: completionDisabled }}
          disabled={completionDisabled}
          onPress={onSkip}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed && !completionDisabled ? tokens.bgHoverOpaque : 'transparent' },
            pressed && !completionDisabled && !prefersReducedMotion ? styles.pressedScale : null,
            completionDisabled ? styles.disabled : null,
          ]}
        >
          <FastForward
            size={20}
            color={tokens.fg3}
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
            { backgroundColor: pressed && !disabled ? tokens.bgHoverOpaque : 'transparent' },
            pressed && !disabled && !prefersReducedMotion ? styles.pressedScale : null,
            disabled ? styles.disabled : null,
          ]}
        >
          <Trash2
            size={20}
            color={tokens.statusBad}
            strokeWidth={1.8}
          />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={({ pressed }) => [
            styles.actionBtn,
            { backgroundColor: pressed ? tokens.bgHoverOpaque : 'transparent' },
            pressed && !prefersReducedMotion ? styles.pressedScale : null,
          ]}
        >
          <X size={20} color={tokens.fg2} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
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
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    letterSpacing: 0.24,
  },
  countValue: {
    fontFamily: 'GeistMono_500Medium',
    fontVariant: ['tabular-nums'],
  },
  selectAllBtn: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  selectAllFill: {
    position: 'absolute',
    inset: 0,
    borderRadius: 999,
  },
  selectAllText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    overflow: 'hidden',
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
