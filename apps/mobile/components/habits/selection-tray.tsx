import { ShellContent } from '@/components/shell/shell-content'
import { useState, type ReactNode } from 'react'
import { SPACING, TOUCH_TARGET_MIN, typeRoles } from '@orbit/shared/theme'
import { MAX_BULK_OPERATION_SIZE } from '@orbit/shared/api'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native-gesture-handler'
import { CheckCircle2, FastForward, ArrowsMove, Trash2, X } from '@/components/ui/icons'
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
  onMove: () => void
  onDelete: () => void
  onClose: () => void
  countSuffixLabel: string
  selectAllLabel: string
  deselectAllLabel: string
  logLabel: string
  skipLabel: string
  moveLabel: string
  deleteLabel: string
  closeLabel: string
  completionReadOnly?: boolean
  completionReason?: string
}

function SelectionAction({
  label, hint, disabled, onPress, pressedFill, prefersReducedMotion, children,
}: Readonly<{
  label: string
  hint?: string
  disabled: boolean
  onPress: () => void
  pressedFill: string
  prefersReducedMotion: boolean
  children: ReactNode
}>) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(!disabled)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(!disabled)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: (pressed || hovered || focused) && !disabled ? pressedFill : 'transparent' },
        pressed && !disabled && !prefersReducedMotion ? styles.pressedScale : null,
        disabled ? styles.disabled : null,
      ]}
    >
      {children}
    </Pressable>
  )
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
  onMove,
  onDelete,
  onClose,
  countSuffixLabel,
  selectAllLabel,
  deselectAllLabel,
  logLabel,
  skipLabel,
  moveLabel,
  deleteLabel,
  closeLabel,
  completionReadOnly = false,
  completionReason,
}: Readonly<SelectionTrayProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const { t } = useTranslation()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const prefersReducedMotion = usePrefersReducedMotion()
  const disabled = count === 0
  const completionDisabled = disabled || completionReadOnly
  const moveLimitReason = count > MAX_BULK_OPERATION_SIZE
    ? t('habits.bulkBar.moveLimit', { limit: MAX_BULK_OPERATION_SIZE }) : undefined
  const moveDisabled = disabled || Boolean(moveLimitReason)

  return (
    <ShellContent><View
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
        <SelectionAction
          label={logLabel}
          disabled={completionDisabled}
          hint={completionReadOnly ? completionReason : undefined}
          onPress={onLog}
          pressedFill={tokens.bgHoverOpaque}
          prefersReducedMotion={prefersReducedMotion}
        >
          <CheckCircle2 size={20} color={tokens.fg1} strokeWidth={1.8} />
        </SelectionAction>
        <SelectionAction
          label={skipLabel}
          disabled={completionDisabled}
          hint={completionReadOnly ? completionReason : undefined}
          onPress={onSkip}
          pressedFill={tokens.bgHoverOpaque}
          prefersReducedMotion={prefersReducedMotion}
        >
          <FastForward size={20} color={tokens.fg3} strokeWidth={1.8} />
        </SelectionAction>
        <SelectionAction
          label={moveLabel}
          disabled={moveDisabled}
          hint={moveLimitReason}
          onPress={onMove}
          pressedFill={tokens.bgHoverOpaque}
          prefersReducedMotion={prefersReducedMotion}
        >
          <ArrowsMove size={20} color={tokens.fg2} strokeWidth={1.8} />
        </SelectionAction>
        <SelectionAction
          label={deleteLabel}
          disabled={disabled}
          onPress={onDelete}
          pressedFill={tokens.bgHoverOpaque}
          prefersReducedMotion={prefersReducedMotion}
        >
          <Trash2 size={20} color={tokens.statusBad} strokeWidth={1.8} />
        </SelectionAction>
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
      {moveLimitReason ? <Text style={[styles.moveLimit, { color: tokens.fg2 }]}>{moveLimitReason}</Text> : null}
    </View></ShellContent>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: SPACING.s16,
    paddingVertical: SPACING.s12,
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
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingVertical: SPACING.s4,
    paddingHorizontal: SPACING.s4,
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
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
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
  moveLimit: {
    fontFamily: 'Geist_400Regular',
    fontSize: typeRoles.secondary.size,
    lineHeight: typeRoles.secondary.size * typeRoles.secondary.lineHeight,
  },
})
