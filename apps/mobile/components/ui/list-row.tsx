import { usePrefersReducedMotion } from '@/lib/motion'
import { PersonalText } from '@/components/ui/personal-text'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { InsetFocusPressable as Pressable } from '@/components/ui/inset-focus-pressable'
import Animated from 'react-native-reanimated'
import type { ReactNode, Ref } from 'react'
import { cloneElement, isValidElement, useState } from 'react'
import { Pressable as NativePressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronDown, ChevronRight } from '@/components/ui/icons'
import { SwitchTrack } from '@/components/ui/switch'
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

function hasSupportingLine({ description, textMode, value }: Readonly<Pick<ListRowProps, 'description' | 'textMode' | 'value'>>) {
  return !!description || (textMode === 'personal' && !!value)
}

function getBodyStyle(hasDescription: boolean, column: boolean) {
  return [styles.body, column ? styles.columnBody : styles.insetBody, hasDescription ? styles.descriptionBody : null]
}

function RowValue({ value, wrap, color, personal, expanded }: Readonly<{ value: string | undefined; wrap: boolean; color: string; personal?: boolean; expanded?: boolean }>) {
  if (!value) return null
  if (personal) return <PersonalText expanded={expanded} style={[styles.value, { maxWidth: '100%', color }]}>{value}</PersonalText>
  return <Text data-slot="list-row-value" style={[styles.value, wrap ? styles.wrappedValue : null, { color }]} numberOfLines={wrap ? undefined : 1}>{value}</Text>
}

function titleLineLimit(textMode: ListRowProps['textMode'], wrapTitle: ListRowProps['wrapTitle']) {
  return textMode === 'personal' || textMode === 'label' || wrapTitle ? undefined : 1
}

function wrappedTitleStyle(textMode: ListRowProps['textMode'], wrapTitle: ListRowProps['wrapTitle']) {
  return textMode === 'label' || wrapTitle ? styles.wrappedTitle : null
}

function getTextBlockStyle(textMode: ListRowProps['textMode'], wrapValue: ListRowProps['wrapValue']) {
  return [styles.textBlock, wrapValue ? styles.wrappedTextBlock : textMode === 'label' ? styles.labelTextBlock : null]
}

function hasInlineControl(textMode: ListRowProps['textMode'], trailing: ReactNode, value: ListRowProps['value'], readOnly: ListRowProps['readOnly']) {
  return readOnly === true && textMode === 'label' && Boolean(trailing) && !value
}

function personalTextProps(textMode: ListRowProps['textMode'], expanded: boolean | undefined) {
  return textMode === 'personal' ? { expanded } : {}
}

function RowTextContent({ title, textMode, wrapTitle, description, value, wrapValue, trailing, readOnly, toggle, titleColor, valueColor, personalExpanded, valueTextMode }: Readonly<Pick<ListRowProps, 'title' | 'textMode' | 'wrapTitle' | 'description' | 'value' | 'wrapValue' | 'trailing' | 'compact' | 'readOnly' | 'toggle' | 'personalExpanded' | 'valueTextMode'> & { titleColor: string; valueColor: string }>) {
  const Title = textMode === 'personal' ? PersonalText : Text
  const Description = textMode === 'personal' ? PersonalText : Text
  const keepsControlInline = !!toggle || hasInlineControl(textMode, trailing, value, readOnly)
  const text = <View style={[getTextBlockStyle(textMode, wrapValue), keepsControlInline ? styles.labelControlText : null, toggle ? { minHeight: 28 } : null]}>
    <Title data-slot="list-row-title" {...personalTextProps(textMode, personalExpanded)} numberOfLines={titleLineLimit(textMode, wrapTitle)} ellipsizeMode="tail" style={[styles.title, wrappedTitleStyle(textMode, wrapTitle || (textMode === 'personal' && !!value)), { color: titleColor }]}>{title}</Title>
    {description ? <Description data-slot="list-row-description" {...personalTextProps(textMode, personalExpanded)} ellipsizeMode="tail" style={[styles.description, { color: valueColor }]}>{description}</Description> : null}
  </View>
  const rowValue = <RowValue personal={valueTextMode === 'personal'} expanded={personalExpanded} value={value} wrap={wrapValue === true || textMode === 'label'} color={valueColor} />
  return useArrangedRowText({ textMode, wrapValue, trailing }, text, rowValue, keepsControlInline)
}

function useArrangedRowText({ textMode, wrapValue, trailing }: Readonly<Pick<ListRowProps, 'textMode' | 'wrapValue' | 'trailing'>>, text: ReactNode, rowValue: ReactNode, keepsControlInline: boolean) {
  const { fontScale } = useWindowDimensions()
  if (textMode === 'personal') return <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{text}{rowValue}</View>
  if (!wrapValue && textMode !== 'label') return <>{text}{rowValue}</>
  const trailingStyle = keepsControlInline ? { minHeight: Math.max(28, 23.8 * fontScale), justifyContent: 'center' as const } : null
  return <View style={[styles.wrappedContent, textMode === 'label' ? styles.labelContent : null, keepsControlInline ? styles.labelControlContent : null]}>{text}{rowValue}{textMode === 'label' && trailing ? <View data-slot="list-row-trailing" style={[styles.trailing, trailingStyle]}>{trailing}</View> : null}</View>
}

function renderLeadingIcon(icon: ListRowProps['icon'], color: string) {
  if (typeof icon === 'string') return <Icon name={icon} size={24} color={color} />
  if (isValidElement<{ color?: string }>(icon)) {
    return icon.props.color === undefined ? cloneElement(icon, { color }) : icon
  }
  return icon
}

function ownsPersonalDisclosure(original: Readonly<ListRowProps>) {
  return (original.textMode === 'personal' || original.valueTextMode === 'personal') && !original.onClick && !original.readOnly
}

function useRowDisclosure(original: Readonly<ListRowProps & { ref?: Ref<View> }>) {
  const [disclosed, setDisclosed] = useState(false)
  const ownsDisclosure = ownsPersonalDisclosure(original)
  const props = ownsDisclosure ? { ...original, accessibilityLabel: original.accessibilityLabel ?? [original.title, original.description, original.value].filter(Boolean).join(', '), expanded: disclosed, personalExpanded: disclosed, onClick: () => setDisclosed(!disclosed), chevron: original.chevron ?? true } : original
  const ChevronIcon = ownsDisclosure ? ChevronDown : ChevronRight
  return { props, ChevronIcon }
}

function useRowInteraction(disabled: boolean) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const highlighted = !disabled && (pressed || focused || hovered)
  return { pressed, focused, highlighted,
    onPressIn: () => setPressed(true), onPressOut: () => setPressed(false),
    onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false),
  }
}

function rowHighlight(column: boolean, disabled: boolean, highlighted: boolean, color: string) {
  return !column && !disabled && highlighted ? { backgroundColor: color } : null
}

function rowAccessibilityState(props: ListRowProps) {
  return { ...(props.disabled || props.toggle?.pending ? { disabled: true } : {}), ...(props.expanded === undefined ? {} : { expanded: props.expanded }), ...(props.toggle ? { checked: props.toggle.checked } : {}), ...(props.toggle?.pending ? { busy: true } : {}) }
}

function ColumnFill({ props, interaction, tokens }: Readonly<{ props: ListRowProps; interaction?: ReturnType<typeof useRowInteraction>; tokens?: ReturnType<typeof createTokensV2> }>) {
  if (props.placement !== 'column') return null
  const highlightedStyle = interaction && tokens ? { backgroundColor: interaction.highlighted ? tokens.bgHover : 'transparent', outlineWidth: interaction.focused ? 2 : 0, outlineColor: tokens.fg1, outlineOffset: -2, outlineStyle: 'solid' as const } : null
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" data-slot="list-row-body" style={[styles.outset, hasSupportingLine(props) ? styles.descriptionBody : null, highlightedStyle]} />
}

function RowControl({ ref, props, bodyStyle, interaction, tokens, children }: Readonly<{ ref?: Ref<View>; props: ListRowProps; bodyStyle: ReturnType<typeof getBodyStyle>; interaction: ReturnType<typeof useRowInteraction>; tokens: ReturnType<typeof createTokensV2>; children: ReactNode }>) {
  const column = props.placement === 'column'
  const slot = column ? undefined : 'list-row-body'
  if (props.readOnly || (!props.onClick && !props.toggle)) return <View data-slot={slot} style={bodyStyle}><ColumnFill props={props} />{children}</View>
  const Control = column ? NativePressable : Pressable
  const toggle = props.toggle
  const disabled = Boolean(props.disabled || toggle?.pending)
  return <Control data-slot={slot} ref={ref} focusOffset={-2} hitSlop={column ? { left: 16, right: 16 } : undefined}
    accessibilityRole={toggle ? "switch" : "button"} accessibilityLabel={props.accessibilityLabel ?? props.title}
    accessibilityState={rowAccessibilityState(props)} disabled={disabled}
    onPress={toggle ? () => toggle.onChange(!toggle.checked) : props.onClick}
    onPressIn={interaction.onPressIn} onPressOut={interaction.onPressOut} onFocus={interaction.onFocus} onBlur={interaction.onBlur} onHoverIn={interaction.onHoverIn} onHoverOut={interaction.onHoverOut}
    style={({ pressed }) => [bodyStyle, getDisabledStyle(disabled), rowHighlight(column, disabled, pressed || interaction.highlighted, tokens.bgHover)]}>
    <ColumnFill props={props} interaction={interaction} tokens={tokens} />
    {children}
  </Control>
}

function rowContentStyle(props: ListRowProps, trailing: ReactNode) {
  return props.textMode === 'label' || (props.wrapTitle && trailing) ? styles.labelContent : null
}

function rowAccessory(props: ListRowProps) {
  return props.toggle ? <SwitchTrack checked={props.toggle.checked} pending={props.toggle.pending} /> : props.trailing
}

export function ListRow({ ref, ...original }: Readonly<ListRowProps & { ref?: Ref<View> }>) {
  const { props: disclosedProps, ChevronIcon } = useRowDisclosure(original)
  const props = disclosedProps.toggle ? { ...disclosedProps, textMode: 'label' as const } : disclosedProps
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { icon, description, danger = false, action, chevron = true, disabled = false, readOnly = false } = props
  const reducedMotion = usePrefersReducedMotion()
  const interaction = useRowInteraction(Boolean(disabled || props.toggle?.pending))
  const rowColors = { iconColor: danger ? tokens.statusBad : tokens.fg1 }
  const titleColor = danger ? tokens.statusBadText : tokens.fg1
  const column = props.placement === 'column'
  const bodyStyle = getBodyStyle(hasSupportingLine(props), column)
  const rowTrailing = rowAccessory(props)
  const { fontScale } = useWindowDimensions()
  const switchLine = props.toggle ? { minHeight: Math.max(28, 23.8 * fontScale), justifyContent: 'center' as const } : null
  const body: ReactNode = (
    <AnimatedContent data-slot="list-row-content" style={[reducedMotion ? null : PRESS_TRANSITION, styles.bodyContent, rowContentStyle(props, rowTrailing), props.toggle ? styles.switchContent : null, interaction.pressed && !reducedMotion ? { transform: [{ scale: 0.96 }] } : null]}>
      {icon ? (
        <View data-slot="list-row-icon" importantForAccessibility="no-hide-descendants" style={[styles.iconSlot, switchLine]}>
          {renderLeadingIcon(icon, rowColors.iconColor)}
        </View>
      ) : null}
      <RowTextContent {...props} trailing={rowTrailing} titleColor={titleColor} valueColor={interaction.highlighted ? tokens.fg2 : tokens.fg3} />
      {rowTrailing && props.textMode !== 'label' ? <View data-slot="list-row-trailing" style={[styles.trailing, switchLine]}>{rowTrailing}</View> : null}
      {!readOnly && !props.toggle && chevron ? <View data-slot="list-row-chevron" importantForAccessibility="no-hide-descendants" style={styles.chevron}><ChevronIcon size={24} color={tokens.fg3} strokeWidth={1.5} /></View> : null}
    </AnimatedContent>
  )

  return (
    <View style={styles.row}>
      <RowControl ref={ref} props={props} bodyStyle={bodyStyle} interaction={interaction} tokens={tokens}>{body}</RowControl>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.action, { marginVertical: description ? 8 : 4, marginEnd: 16 }, pressed ? { backgroundColor: tokens.bgHover } : null]}>
          {({ pressed }) => (
            <AnimatedContent style={[reducedMotion ? null : PRESS_TRANSITION, styles.control, pressed && !reducedMotion ? { transform: [{ scale: 0.96 }] } : null]}>
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
  body: { minHeight: 52, paddingVertical: 12, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  insetBody: { paddingHorizontal: 16, overflow: 'hidden' },
  columnBody: { position: 'relative' },
  outset: { minHeight: 52, paddingVertical: 12, position: 'absolute', top: 0, bottom: 0, left: -16, right: -16, borderRadius: 12 },
  descriptionBody: { minHeight: 68 },
  bodyContent: { minHeight: 24, flex: 1, minWidth: 0, gap: 12, flexDirection: 'row', alignItems: 'center' },
  action: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, marginStart: 0, alignSelf: 'center', flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  iconSlot: { width: 28, minHeight: 24, flexShrink: 0, alignItems: 'center' },
  textBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 4 },
  wrappedContent: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  labelContent: { minHeight: 24, alignItems: 'flex-start' },
  switchContent: { alignItems: 'flex-start' },
  labelControlContent: { flexWrap: 'nowrap', alignItems: 'flex-start' },
  labelControlText: { flexBasis: 0, flexShrink: 1 },
  labelTextBlock: { flexBasis: 'auto', flexShrink: 0, maxWidth: '100%', minHeight: 24, justifyContent: 'center' },
  wrappedTextBlock: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%' },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 21.25 },
  wrappedTitle: { lineHeight: 23.8 },
  chevron: { width: 24, minHeight: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  value: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16.8, letterSpacing: 0.24, fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '50%' },
  wrappedValue: { flexShrink: 0, maxWidth: '100%' },
  trailing: { flexShrink: 0 },
  control: { width: TOUCH_TARGET_MIN, height: TOUCH_TARGET_MIN, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  disabled: { opacity: 0.5 },
})
