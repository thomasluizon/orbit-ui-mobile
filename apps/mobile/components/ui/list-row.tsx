import { hoverForeground, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
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

function getBodyStyle(compact: boolean, hasAction: boolean, inset: boolean, hasDescription: boolean, compactForm: boolean, hasTrailing: boolean) {
  return [styles.body, hasDescription && !compact ? styles.descriptionBody : null, compact ? styles.compactBody : null, compactForm ? styles.formBody : null, !inset ? styles.bareBody : null, hasAction ? styles.bodyWithAction : null, compact && hasAction ? { minHeight: TOUCH_TARGET_MIN + 8 } : null, compact && hasTrailing ? styles.controlRowBody : null]
}

function RowValue({ value, wrap, color }: Readonly<{ value: string; wrap: boolean; color: string }>) {
  return <Text style={[styles.value, wrap ? styles.wrappedValue : null, { color }]} numberOfLines={wrap ? undefined : 1}>{value}</Text>
}

function titleLineLimit(textMode: ListRowProps['textMode'], wrapTitle: ListRowProps['wrapTitle']) {
  if (textMode === 'personal') return 2
  return textMode === 'label' || wrapTitle ? undefined : 1
}

function chevronStyle(textMode: ListRowProps['textMode']) {
  return textMode ? styles.chevron : [styles.chevron, { width: TOUCH_TARGET_MIN }]
}

function wrappedTitleStyle(textMode: ListRowProps['textMode'], wrapTitle: ListRowProps['wrapTitle']) {
  return textMode === 'label' || wrapTitle ? styles.wrappedTitle : null
}

function getTextBlockStyle(textMode: ListRowProps['textMode'], wrapValue: ListRowProps['wrapValue'], wrapTitle: ListRowProps['wrapTitle'], compact: boolean, hasTrailing: boolean) {
  return [styles.textBlock, compact && hasTrailing ? styles.controlRowText : null, wrapTitle && hasTrailing ? styles.wrappedControlText : null, wrapValue ? styles.wrappedTextBlock : textMode === 'label' ? styles.labelTextBlock : null]
}

function hasInlineControl(textMode: ListRowProps['textMode'], trailing: ReactNode, value: ListRowProps['value'], readOnly: ListRowProps['readOnly']) {
  return readOnly === true && textMode === 'label' && Boolean(trailing) && !value
}

function RowTextContent({ title, textMode, wrapTitle, description, value, wrapValue, trailing, compact = !description, readOnly, titleColor, valueColor }: Readonly<Pick<ListRowProps, 'title' | 'textMode' | 'wrapTitle' | 'description' | 'value' | 'wrapValue' | 'trailing' | 'compact' | 'readOnly'> & { titleColor: string; valueColor: string }>) {
  const keepsControlInline = hasInlineControl(textMode, trailing, value, readOnly)
  const text = <View style={[getTextBlockStyle(textMode, wrapValue, wrapTitle, compact, !!trailing), keepsControlInline ? styles.labelControlText : null]}>
    <Text numberOfLines={titleLineLimit(textMode, wrapTitle)} ellipsizeMode="tail" style={[styles.title, wrappedTitleStyle(textMode, wrapTitle), { color: titleColor }]}>{title}</Text>
    {description ? <Text numberOfLines={textMode === 'personal' ? 2 : undefined} style={[styles.description, textMode === 'personal' ? styles.personalDescription : null, { color: valueColor }]}>{description}</Text> : null}
  </View>
  const rowValue = value ? <RowValue value={value} wrap={wrapValue === true || textMode === 'label'} color={valueColor} /> : null
  return wrapValue || textMode === 'label' ? <View style={[styles.wrappedContent, textMode === 'label' ? styles.labelContent : null, keepsControlInline ? styles.labelControlContent : null]}>{text}{rowValue}{textMode === 'label' && trailing ? <View style={styles.trailing}>{trailing}</View> : null}</View> : <>{text}{rowValue}</>
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
  const { ref, accessibilityLabel, expanded, icon, description, trailing, danger = false, action, chevron = true, compact = !description, inset = true, inForm = false, disabled = false, onClick, readOnly = false } = props
  const rowColors = { iconColor: danger ? tokens.statusBad : tokens.fg1 }
  const titleColor = danger ? hoverForeground(currentTheme, tokens.statusBadText, bodyPressed) : tokens.fg1
  const compactForm = inForm && props.compact === true
  const bodyStyle = getBodyStyle(compact, !!action, inset, !!description, compactForm, !!trailing)
  const body: ReactNode = (
    <AnimatedContent style={[PRESS_TRANSITION, styles.bodyContent, props.textMode === 'label' || (props.wrapTitle && trailing) ? styles.labelContent : null, bodyPressed ? { transform: [{ scale: 0.96 }] } : null]}>
      {icon ? (
        <View importantForAccessibility="no-hide-descendants" style={styles.iconSlot}>
          {renderLeadingIcon(icon, rowColors.iconColor)}
        </View>
      ) : null}
      <RowTextContent {...props} titleColor={titleColor} valueColor={bodyPressed ? tokens.fg2 : tokens.fg3} />
      {trailing && props.textMode !== 'label' ? <View style={styles.trailing}>{trailing}</View> : null}
      {!readOnly && chevron ? <View importantForAccessibility="no-hide-descendants" style={chevronStyle(props.textMode)}><ChevronRight size={24} color={tokens.fg3} strokeWidth={1.8} /></View> : null}
    </AnimatedContent>
  )

  return (
    <View style={[styles.row, inForm ? styles.formRow : null]}>
      {readOnly || !onClick ? (
        <View style={bodyStyle}>{body}</View>
      ) : (
        <Pressable ref={ref} focusOffset={-6} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled, expanded }} disabled={disabled} onPress={onClick} onPressIn={() => setBodyPressed(true)} onPressOut={() => setBodyPressed(false)} style={({ pressed }) => [bodyStyle, getDisabledStyle(disabled), pressed ? { backgroundColor: tokens.bgHover } : null]}>{body}</Pressable>
      )}
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.action, { marginVertical: !compact && inset && description ? 16 : 4, marginEnd: inset ? compactForm ? 12 : 16 : 0 }, pressed ? { backgroundColor: tokens.bgHover } : null]}>
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
  body: { minHeight: 56, paddingVertical: 4, paddingHorizontal: 16, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden' },
  descriptionBody: { minHeight: 76, paddingVertical: 16 },
  compactBody: { minHeight: 52, paddingVertical: 4 },
  formBody: { paddingHorizontal: 12 },
  bareBody: { minHeight: 52, paddingVertical: 4, paddingHorizontal: 0, paddingStart: 0, paddingEnd: 0 },
  bodyContent: { minHeight: 24, flex: 1, minWidth: 0, gap: 12, flexDirection: 'row', alignItems: 'center' },
  controlRowBody: { paddingVertical: 0 },
  controlRowText: { paddingVertical: 4 },
  wrappedControlText: { minHeight: TOUCH_TARGET_MIN, justifyContent: 'center' },
  bodyWithAction: { paddingEnd: 0 },
  action: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, marginStart: 0, alignSelf: 'center', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  iconSlot: { width: 28, minHeight: 24, flexShrink: 0, alignItems: 'center' },
  textBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 4 },
  wrappedContent: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  labelContent: { minHeight: 24, alignItems: 'flex-start' },
  labelControlContent: { flexWrap: 'nowrap' },
  labelControlText: { flexBasis: 0, flexShrink: 1 },
  labelTextBlock: { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%', minHeight: 24, justifyContent: 'center' },
  wrappedTextBlock: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%' },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 21.25 },
  wrappedTitle: { lineHeight: 23.8 },
  chevron: { width: 24, minHeight: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  personalDescription: { fontSize: 12, lineHeight: 16.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '50%' },
  wrappedValue: { flexShrink: 0, maxWidth: '100%' },
  trailing: { flexShrink: 0, paddingHorizontal: 8 },
  control: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  disabled: { opacity: 0.5 },
})
