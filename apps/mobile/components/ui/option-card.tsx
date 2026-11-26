import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { OptionCardProps } from '@orbit/shared/contracts/flow'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { SkeletonFace } from '@/components/ui/skeleton'
import { useFlowLook } from '@/components/ui/flow-look'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const OptionReasonContext = createContext<((id: string, reason: string | null) => void) | null>(null)

function useReportedReason(reason: string | null) {
  const report = useContext(OptionReasonContext)
  const id = useId()
  useEffect(() => {
    report?.(id, reason)
    return () => report?.(id, null)
  }, [report, id, reason])
  return report !== null
}

/** The grid of the quick options of one question. A disabled option reports its reason here, and the group shows each different reason once, centred, 8 under the grid. */
export function OptionGroup({ children }: Readonly<{ children: ReactNode }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [reasons, setReasons] = useState<ReadonlyMap<string, string>>(new Map())
  const report = useCallback((id: string, reason: string | null) => {
    setReasons((current) => {
      if ((current.get(id) ?? null) === reason) return current
      const next = new Map(current)
      if (reason === null) next.delete(id)
      else next.set(id, reason)
      return next
    })
  }, [])
  const shown = [...new Set(reasons.values())]
  return (
    <View testID="option-group" style={styles.group}>
      <OptionReasonContext value={report}>
        <View style={optionGridStyle}>{children}</View>
      </OptionReasonContext>
      {shown.map((reason) => <Text key={reason} testID="option-group-reason" style={[styles.reason, { color: tokens.fg3 }]}>{reason}</Text>)}
    </View>
  )
}

/** A quick option. A press answers. Selection takes the `--primary` ring and focus takes the `--fg-1` ring. A wide option holds one line and ends a long label with an ellipsis; its accessible name keeps the full label. An option that waits for its own request keeps its label over the skeleton face. */
export function OptionCard({ label, selected = false, disabled = false, disabledReason, loading = false, wide = false, onSelect, onHighlight }: Readonly<OptionCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const control = useRef<View>(null)
  const { lookAtControl, lookAway } = useFlowLook()
  const reason = disabled && disabledReason ? disabledReason : null
  const inGroup = useReportedReason(reason)
  return (
    <View style={[styles.wrapper, wide ? styles.wide : null]}>
      <MotionPressable
        ref={control}
        focusInset
        selectionRingWidth={2}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected, disabled: disabled || loading, busy: loading }}
        disabled={disabled || loading}
        testID="option-card"
        onPress={onSelect}
        onFocus={() => { lookAtControl(control); onHighlight?.(true) }}
        onBlur={() => { lookAway(); onHighlight?.(false) }}
        style={({ pressed }) => [styles.card, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard }, disabled && !loading ? styles.disabled : null]}
      >
        {loading ? <SkeletonFace tokens={tokens} /> : null}
        <Text style={[styles.label, { color: tokens.fg1 }]} numberOfLines={wide ? 1 : 2} ellipsizeMode="tail">{label}</Text>
      </MotionPressable>
      {reason && !inGroup ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{reason}</Text> : null}
    </View>
  )
}

/** The two-column grid that holds the quick options of one question. */
export const optionGridStyle = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 } }).grid

const styles = StyleSheet.create({
  group: { width: '100%', gap: 8 },
  wrapper: { width: '48%', gap: 4, minWidth: 0 },
  wide: { width: '100%' },
  card: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 12 },
  disabled: { opacity: 0.5 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 24, textAlign: 'center' },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16, textAlign: 'center' },
})
