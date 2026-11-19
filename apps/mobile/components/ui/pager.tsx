import { ActionRow } from '@/components/ui/action-row'
import type { PagerProps } from '@orbit/shared/contracts/navigation'
import { StyleSheet, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from './pill-button'

export function PagerSegments({ count, index, label }: Readonly<Pick<PagerProps, 'count' | 'index' | 'label'>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View accessibilityRole="list" accessibilityLabel={label} style={styles.segments}>
      {Array.from({ length: count }, (_, position) => (
        <View key={position} accessible accessibilityLabel={String(position + 1)}
          accessibilityState={{ selected: position === index }}
          testID={`pager-segment-${position}-${position === index ? 'current' : position < index ? 'past' : 'future'}`}
          style={[styles.segment, { backgroundColor: position === index ? tokens.primary : position < index ? tokens.fg3 : tokens.statusEmpty }]} />
      ))}
    </View>
  )
}

export function Pager(props: Readonly<PagerProps>) {
  return (
    <View testID={`pager-${props.index}`} style={styles.container}>
      <PagerSegments count={props.count} index={props.index} label={props.label} />
      <View style={styles.controls}><ActionRow>
        <PillButton variant="ghost" accessibleName={props.backLabel} disabled={!props.onBack} onClick={props.onBack}>{props.backLabel}</PillButton>
        {props.forwardLabel !== undefined ? (
          <PillButton accessibleName={props.forwardLabel} disabled={!props.onForward} onClick={props.onForward}>{props.forwardLabel}</PillButton>
        ) : props.forwardSlot}
      </ActionRow></View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { height: 4, flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
})
