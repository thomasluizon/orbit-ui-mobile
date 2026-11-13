import * as Primitive from '@rn-primitives/select'
import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import type { SelectOption, SelectProps } from '@orbit/shared/contracts/forms'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Check, ChevronDown } from '@/components/ui/icons'
import { InsetFocusPressable } from '@/components/ui/inset-focus-pressable'
import { PressFill } from '@/components/ui/press-fill'
import { PressScale } from '@/components/motion/press-scale'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { useThemeTokens } from '@/hooks/use-theme-tokens'

const SelectionContext = createContext<(() => void) | null>(null)
const CloseContext = createContext<(() => void) | null>(null)

export function Root({ value, onChange, options, disabled, children }: Readonly<SelectProps & { children: ReactNode }>) {
  const pendingValue = useRef<string | null>(null)
  const commit = () => {
    const next = pendingValue.current
    pendingValue.current = null
    if (next !== null) onChange(next)
  }
  return <SelectionContext.Provider value={commit}>
    <Primitive.Root value={options.find((option) => option.value === (value ?? options.find((candidate) => !candidate.disabled)?.value))} disabled={disabled} onValueChange={(option) => {
      if (option && options.some((candidate) => candidate.value === option.value && !candidate.disabled)) pendingValue.current = option.value
    }} style={styles.root}>{children}</Primitive.Root>
  </SelectionContext.Provider>
}

/** A field-shaped trigger: the `borderControl` field border, the `bgHoverOpaque` layer over its field fill on hover and press, and the shared press scale. */
export function Trigger(props: ComponentProps<typeof Primitive.Trigger>) {
  const tokens = useThemeTokens()
  const { value, disabled } = Primitive.useRootContext()
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  return <PressScale pressed={pressed} disabled={Boolean(disabled)}><Primitive.Trigger {...props} disabled={disabled} accessibilityRole="combobox" accessibilityValue={{ text: value?.label ?? '' }} asChild><InsetFocusPressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} focusColor={tokens.fg1} style={[styles.trigger, { backgroundColor: tokens.bgField, borderColor: tokens.borderControl }]}>
    {({ pressed: held }) => <>
      <PressFill pressed={!disabled && (held || hovered)} color={tokens.bgHoverOpaque} />
      <Primitive.Value placeholder="" style={[styles.value, { color: tokens.fg1 }]} /><ChevronDown size={20} color={!disabled && (held || hovered) ? tokens.fg2 : tokens.fg3} />
    </>}
  </InsetFocusPressable></Primitive.Trigger></PressScale>
}

export const Portal = Primitive.Portal

export function Content({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  const { open, onOpenChange } = Primitive.useRootContext()
  const commit = useContext(SelectionContext)
  const { sheetRef, closeSheet } = useSheetHost()
  if (!open) return null
  return <Sheet ref={sheetRef} open title={label} onClose={() => { onOpenChange(false); commit?.() }}>
    <CloseContext.Provider value={() => closeSheet()}><View accessibilityRole="list" accessibilityLabel={label}>{children}</View></CloseContext.Provider>
  </Sheet>
}

export function SelectCheck() {
  const tokens = useThemeTokens()
  return <Primitive.ItemIndicator><Check size={20} color={tokens.fg1} accessible={false} /></Primitive.ItemIndicator>
}

export function Item({ value, label, disabled }: Readonly<SelectOption>) {
  const tokens = useThemeTokens()
  const [hovered, setHovered] = useState(false)
  const close = useContext(CloseContext)
  return <Primitive.Item value={value} label={label} disabled={disabled} closeOnPress={false} onPress={() => close?.()} focusable={!disabled} accessibilityLabel={label} asChild><InsetFocusPressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} focusColor={tokens.fg1} style={({ pressed }) => [styles.item, { backgroundColor: !disabled && (pressed || hovered) ? tokens.bgHover : 'transparent', opacity: disabled ? 0.5 : 1 }]}>
    {({ pressed }) => <PressScale pressed={pressed} disabled={Boolean(disabled)} style={styles.itemContent}><Primitive.ItemText style={[styles.label, { color: tokens.fg1 }]} /><SelectCheck /></PressScale>}
  </InsetFocusPressable></Primitive.Item>
}

export function Select(props: Readonly<SelectProps>) {
  return <Root {...props}><Trigger accessibilityLabel={props.label} /><Content label={props.label}>
    {props.options.map((option) => <Item key={option.value} {...option} />)}
  </Content></Root>
}

const styles = StyleSheet.create({
  root: { minWidth: 0 },
  trigger: { overflow: 'hidden', minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderRadius: 12, borderWidth: 1, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s12 },
  value: { fontFamily: 'Geist_400Regular', fontSize: 16, flexShrink: 1 },
  item: { overflow: 'hidden', minHeight: TOUCH_TARGET_MIN, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: SPACING.s12, paddingVertical: SPACING.s8, borderRadius: 12 },
  itemContent: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 14, flexShrink: 1 },
})
