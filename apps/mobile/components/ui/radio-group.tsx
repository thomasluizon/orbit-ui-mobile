import * as Primitive from '@rn-primitives/radio-group'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'
import { type ReactElement, type ReactNode } from 'react'
import type { ViewProps } from 'react-native'
import { SelectionFocusProvider, useSelectionFocusGroup, useSelectionFocusItem, useHasSelectionFocusGroup } from './selection-focus'

type GroupProps = ViewProps & { children: ReactNode; onCommit?: () => void; focusRequest?: number; shouldFocus?: () => boolean }

export function RadioGroup({ children, onCommit, focusRequest, shouldFocus, ...props }: Readonly<GroupProps>) {
  return <SelectionFocusProvider onCommit={onCommit} focusRequest={focusRequest} shouldFocus={shouldFocus} accessibilityHint={props.accessibilityHint}>
    <RadioRoot {...props}>{children}</RadioRoot>
  </SelectionFocusProvider>
}

function RadioRoot({ children, style, ...props }: Readonly<ViewProps & { children: ReactNode }>) {
  const { value, select } = useSelectionFocusGroup()
  return <Primitive.Root {...props} style={[{ gap: INTERACTION_FILL_CLEARANCE }, style]} value={value} onValueChange={select} accessibilityRole="radiogroup">{children}</Primitive.Root>
}

function RegisteredItem({ selected, onSelect, disabled = false, busy = false, children }: Readonly<{ selected: boolean; onSelect?: () => void; disabled?: boolean; busy?: boolean; children: ReactElement }>) {
  const { id, elementRef, onCommit, onFocus, ...focusProps } = useSelectionFocusItem({ selected, onSelect, disabled: disabled || busy })
  return <Primitive.Item {...focusProps} ref={elementRef} asChild value={id} disabled={disabled} focusable={!disabled} onPress={() => { if (!busy) onCommit() }} onFocus={onFocus}>{children}</Primitive.Item>
}

export function RadioItem(props: Readonly<{ selected: boolean; onSelect?: () => void; disabled?: boolean; busy?: boolean; children: ReactElement }>) {
  const grouped = useHasSelectionFocusGroup()
  return grouped ? <RegisteredItem {...props} /> : <RadioGroup><RegisteredItem {...props} /></RadioGroup>
}
