'use client'

import * as Primitive from '@radix-ui/react-radio-group'
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type ReactElement } from 'react'

type Registration = { busy?: boolean; disabled?: boolean; selected: boolean; onSelect?: () => void }
interface GroupContextValue {
  register: (id: string, registration: Registration) => () => void
  activate: (selected: boolean) => void
  navigationKey: () => string
  tabStopId: string
}
const GroupContext = createContext<GroupContextValue | null>(null)

export function RadioGroup({ children, onCommit, focusRequest, shouldFocus, ...props }: Readonly<ComponentProps<typeof Primitive.Root> & { onCommit?: () => void; focusRequest?: number; shouldFocus?: () => boolean }>) {
  const [selected, setSelected] = useState('')
  const [first, setFirst] = useState('')
  const navigationKey = useRef('')
  const pendingCommit = useRef(false)
  const handlers = useRef(new Map<string, Registration>())
  const groupRef = useRef<HTMLDivElement>(null)
  const handledRequest = useRef<number | undefined>(undefined)
  const register = useCallback((id: string, registration: Registration) => {
    handlers.current.set(id, registration)
    if (!registration.disabled) setFirst((current) => current || id)
    if (registration.selected) setSelected(id)
    else setSelected((current) => current === id ? '' : current)
    return () => {
      handlers.current.delete(id)
      setSelected((current) => current === id ? '' : current)
      setFirst((current) => current === id ? [...handlers.current].find(([, item]) => !item.disabled)?.[0] ?? '' : current)
    }
  }, [])
  useEffect(() => {
    if (!focusRequest || handledRequest.current === focusRequest) return
    handledRequest.current = focusRequest
    if (shouldFocus && !shouldFocus()) return
    const group = groupRef.current
    const target = group?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not([disabled])') ?? group?.querySelector<HTMLElement>('[role="radio"]:not([disabled]):not([aria-disabled="true"])')
    navigationKey.current = ''
    target?.focus()
  }, [focusRequest, shouldFocus, selected])
  return <GroupContext.Provider value={{ register, tabStopId: selected || first, navigationKey: () => { const key = navigationKey.current; navigationKey.current = ''; return key }, activate: (checked) => {
    if (checked) onCommit?.()
    else pendingCommit.current = true
  } }}>
    <Primitive.Root {...props} ref={groupRef} value={selected} tabIndex={-1} loop onKeyDown={(event) => { props.onKeyDown?.(event); navigationKey.current = event.key }} onPointerDownCapture={() => { navigationKey.current = '' }} onValueChange={(id) => {
      const item = handlers.current.get(id)
      if (!item || item.disabled || item.busy) return
      item.onSelect?.()
      if (pendingCommit.current) { pendingCommit.current = false; onCommit?.() }
    }}>{children}</Primitive.Root>
  </GroupContext.Provider>
}

export function RadioItem(props: Readonly<{ selected: boolean; onSelect?: () => void; disabled?: boolean; busy?: boolean; children: ReactElement }>) {
  const group = useContext(GroupContext)
  if (!group) return <RadioGroup><RadioItem {...props} /></RadioGroup>
  return <RegisteredItem {...props} group={group} />
}

function RegisteredItem({ selected, onSelect, disabled, busy, children, group }: Readonly<{ selected: boolean; onSelect?: () => void; disabled?: boolean; busy?: boolean; children: ReactElement; group: GroupContextValue }>) {
  const id = useId()
  const navigationClick = useRef(false)
  const { register } = group
  useLayoutEffect(() => register(id, { selected, onSelect, disabled, busy }), [busy, disabled, id, onSelect, register, selected])
  return <Primitive.Item asChild value={id} disabled={disabled} tabIndex={group.tabStopId === id && !disabled ? 0 : -1} onKeyDownCapture={(event) => {
    if (busy && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation() }
  }} onFocus={(event) => {
    if (busy) { event.preventDefault(); return }
    const key = group.navigationKey()
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
      navigationClick.current = true
      event.currentTarget.click()
      event.preventDefault()
    }
  }} onKeyDown={(event) => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.click() }
  }} onClick={(event) => {
    if (busy) { event.preventDefault(); return }
    if (navigationClick.current) navigationClick.current = false
    else group.activate(selected)
  }}>{children}</Primitive.Item>
}
