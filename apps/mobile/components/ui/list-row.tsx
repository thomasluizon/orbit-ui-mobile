import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import Animated from 'react-native-reanimated'
import type { ReactNode, Ref } from 'react'
import { cloneElement, isValidElement, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const AnimatedContent = Animated.createAnimatedComponent(View)
const PRESS_TRANSITION = {
  transition: 'transform 150ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const

function getDisabledStyle(disabled: boolean) {
  return disabled ? styles.disabled : null
}

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean) {
  return [styles.body, compact ? styles.compactBody : null, !inset ? styles.bareBody : null, hasAction ? styles.bodyWithAction : null]
}

function RowValue({ value, wrap, color }: Readonly<{ value: string; wrap: boolean; color: string }>) {
  return <Text style={[styles.value, { color }]} numberOfLines={wrap ? undefined : 1}>{value}</Text>
}

function renderLeadingIcon(icon: ListRowProps['icon'], color: string) {
  if (typeof icon === 'string') return <Icon name={icon} size={24} color={color} />
  if (isValidElement<{ color?: string }>(icon)) {
    return icon.props.color === undefined ? cloneElement(icon, { color }) : icon
  }
  return icon
}

export function ListRow(props: Readonly<ListRowProps & { ref?: Ref<View> }>) {
  const [bodyPressed, setBodyPressed] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { ref, accessibilityLabel, icon, title, wrapTitle, description, value, wrapValue, trailing, danger = false, action, chevron = true, compact = false, inset = true, inForm = false, disabled = false, onClick, readOnly = false } = props
  const rowColors = { iconColor: danger ? tokens.statusBad : tokens.fg1 }
  const titleColor = danger ? tokens.statusBadText : tokens.fg1
  const bodyStyle = getBodyStyle(compact, !!action, inset)
  const body: ReactNode = (
    <AnimatedContent style={[PRESS_TRANSITION, styles.bodyContent, bodyPressed ? { transform: [{ scale: 0.96 }] } : null]}>
      {icon ? (
        <View style={styles.iconSlot}>
          {renderLeadingIcon(icon, rowColors.iconColor)}
        </View>
      ) : null}
      <View style={styles.textBlock}>
        <Text numberOfLines={wrapTitle ? undefined : 1} style={[styles.title, { color: titleColor }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text> : null}
      </View>
      {value ? <RowValue value={value} wrap={wrapValue === true} color={tokens.fg3} /> : null}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {!readOnly && chevron ? <View style={styles.control}><ChevronRight size={24} color={tokens.fg3} strokeWidth={1.8} /></View> : null}
    </AnimatedContent>
  )

  return (
    <View style={[styles.row, inForm ? styles.formRow : null]}>
      {readOnly || !onClick ? (
        <View style={bodyStyle}>{body}</View>
      ) : (
        <Pressable ref={ref} focusOffset={-6} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onClick} onPressIn={() => setBodyPressed(true)} onPressOut={() => setBodyPressed(false)} style={({ pressed }) => [bodyStyle, getDisabledStyle(disabled), pressed ? { backgroundColor: tokens.bgHover } : null]}>{body}</Pressable>
      )}
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.action, pressed ? { backgroundColor: tokens.bgHover } : null]}>
          {({ pressed }) => (
            <AnimatedContent style={[PRESS_TRANSITION, styles.control, pressed ? { transform: [{ scale: 0.96 }] } : null]}>
              <Icon name={action.icon} size={20} color={action.danger ? tokens.statusBad : tokens.fg2} />
            </AnimatedContent>
          )}
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch' },
  formRow: { marginHorizontal: 8, borderRadius: 12, overflow: 'hidden' },
  body: { minHeight: 76, padding: 16, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden' },
  compactBody: { minHeight: 52, paddingVertical: 4, paddingHorizontal: 12 },
  bareBody: { minHeight: 52, paddingVertical: 4, paddingHorizontal: 0, paddingStart: 0, paddingEnd: 0 },
  bodyContent: { minHeight: 44, flex: 1, minWidth: 0, gap: 12, flexDirection: 'row', alignItems: 'center' },
  bodyWithAction: { paddingEnd: 0 },
  action: { width: 44, height: 44, margin: 16, marginStart: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  iconSlot: { width: 28, flexShrink: 0, alignItems: 'center' },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 21.25 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '50%' },
  trailing: { flexShrink: 0, paddingHorizontal: 8 },
  control: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  disabled: { opacity: 0.5 },
})
