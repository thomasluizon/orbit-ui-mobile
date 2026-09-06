import type { PagerProps } from '@orbit/shared/contracts/navigation'
import { StyleSheet, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { PillButton } from './pill-button'

export function Pager(props: Readonly<PagerProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View testID={`pager-${props.index}`} style={styles.container}>
      <View accessibilityRole="list" accessibilityLabel={props.label} style={styles.segments}>
        {Array.from({ length: props.count }, (_, index) => (
          <View key={index} accessible accessibilityLabel={String(index + 1)}
            accessibilityState={{ selected: index === props.index }}
            testID={`pager-segment-${index}-${index === props.index ? 'current' : index < props.index ? 'past' : 'future'}`}
            style={[styles.segment, { backgroundColor: index === props.index ? tokens.primary : index < props.index ? tokens.fg3 : tokens.statusEmpty }]} />
        ))}
      </View>
      <View style={styles.controls}>
        <PillButton variant="ghost" disabled={!props.onBack} onClick={props.onBack}>{props.backLabel}</PillButton>
        {props.forwardLabel !== undefined ? (
          <PillButton disabled={!props.onForward} onClick={props.onForward}>{props.forwardLabel}</PillButton>
        ) : props.forwardSlot}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { height: 4, flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
})
