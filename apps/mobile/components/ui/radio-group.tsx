import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { findNodeHandle, StyleSheet, View, type ViewProps } from 'react-native'

interface RadioItemState {
  disabled: boolean
  id: string
  index: number
  nativeHandle: number | null
  selected: boolean
}

type RadioNavigationProps = Pick<
  ViewProps,
  | 'focusable'
  | 'nextFocusDown'
  | 'nextFocusForward'
  | 'nextFocusLeft'
  | 'nextFocusRight'
  | 'nextFocusUp'
>

interface RadioGroupContextValue {
  getNavigationProps: (id: string) => RadioNavigationProps
  register: (id: string) => () => void
  setElement: (id: string, element: View | null) => void
  update: (state: Omit<RadioItemState, 'nativeHandle'>) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

function navigationProps(
  id: string,
  enabledItems: readonly RadioItemState[],
  forwardTargetHandle: number | null,
): RadioNavigationProps {
  const itemIndex = enabledItems.findIndex((item) => item.id === id)
  if (itemIndex < 0) return { focusable: false }

  const previousIndex = (itemIndex - 1 + enabledItems.length) % enabledItems.length
  const nextIndex = (itemIndex + 1) % enabledItems.length
  const previousHandle = enabledItems[previousIndex]?.nativeHandle ?? undefined
  const nextHandle = enabledItems[nextIndex]?.nativeHandle ?? undefined

  return {
    focusable: true,
    nextFocusDown: nextHandle,
    nextFocusForward: forwardTargetHandle ?? undefined,
    nextFocusLeft: previousHandle,
    nextFocusRight: nextHandle,
    nextFocusUp: previousHandle,
  }
}

export function RadioGroup({ children, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & { children: ReactNode }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const [forwardTargetHandle, setForwardTargetHandle] = useState<number | null>(null)
  const itemHandlesRef = useRef(new Map<string, number | null>())
  const register = useCallback((id: string) => {
    setItems((current) => [...current.filter((item) => item.id !== id), {
      disabled: false,
      id,
      index: 0,
      nativeHandle: itemHandlesRef.current.get(id) ?? null,
      selected: false,
    }])
    return () => {
      itemHandlesRef.current.delete(id)
      setItems((current) => current.filter((item) => item.id !== id))
    }
  }, [])
  const update = useCallback((state: Omit<RadioItemState, 'nativeHandle'>) => {
    setItems((current) => current.map((item) => item.id === state.id ? { ...item, ...state } : item))
  }, [])
  const setElement = useCallback((id: string, element: View | null) => {
    if (!element) return
    const nativeHandle = findNodeHandle(element)
    itemHandlesRef.current.set(id, nativeHandle)
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      if (!item || item.nativeHandle === nativeHandle) return current
      return current.map((candidate) => candidate.id === id
        ? { ...candidate, nativeHandle }
        : candidate)
    })
  }, [])
  const enabledItems = useMemo(() => [...items]
    .sort((first, second) => first.index - second.index)
    .filter((item) => !item.disabled), [items])
  const getNavigationProps = useCallback(
    (id: string) => navigationProps(id, enabledItems, forwardTargetHandle),
    [enabledItems, forwardTargetHandle],
  )
  const contextValue = useMemo(() => ({
    getNavigationProps,
    register,
    setElement,
    update,
  }), [getNavigationProps, register, setElement, update])
  const setForwardTarget = useCallback((element: View | null) => {
    if (element) setForwardTargetHandle(findNodeHandle(element))
  }, [])

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <View {...props} accessibilityRole="radiogroup">{children}</View>
      <View
        ref={setForwardTarget}
        accessibilityElementsHidden
        collapsable={false}
        focusable
        importantForAccessibility="no"
        style={styles.forwardTarget}
        testID="radio-group-forward-target"
      />
    </RadioGroupContext.Provider>
  )
}

export function useRadioGroupItem({
  disabled,
  index,
  onSelect,
  selected,
}: Readonly<{
  disabled: boolean
  index: number
  onSelect?: () => void
  selected: boolean
}>) {
  const group = useContext(RadioGroupContext)
  const registerWithGroup = group?.register
  const setGroupElement = group?.setElement
  const updateGroup = group?.update
  const id = useId()

  useLayoutEffect(() => registerWithGroup?.(id), [id, registerWithGroup])
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, index, selected })
  }, [disabled, id, index, selected, updateGroup])

  const elementRef = useCallback((element: View | null) => {
    setGroupElement?.(id, element)
  }, [id, setGroupElement])
  const onFocus = useCallback(() => {
    if (!disabled && !selected) onSelect?.()
  }, [disabled, onSelect, selected])
  const groupNavigationProps = group?.getNavigationProps(id)

  return {
    elementRef,
    focusable: groupNavigationProps?.focusable ?? !disabled,
    nextFocusDown: groupNavigationProps?.nextFocusDown,
    nextFocusForward: groupNavigationProps?.nextFocusForward,
    nextFocusLeft: groupNavigationProps?.nextFocusLeft,
    nextFocusRight: groupNavigationProps?.nextFocusRight,
    nextFocusUp: groupNavigationProps?.nextFocusUp,
    onFocus,
  }
}

const styles = StyleSheet.create({
  forwardTarget: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    width: 1,
  },
})
