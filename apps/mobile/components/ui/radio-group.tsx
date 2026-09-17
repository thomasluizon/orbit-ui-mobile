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
import { findNodeHandle, View, type ViewProps } from 'react-native'

interface RadioItemState {
  disabled: boolean
  id: string
  index: number
  nativeHandle: number | null
  selected: boolean
}

interface RadioNavigationProps {
  focusable: boolean
  nextFocusDown?: number
  nextFocusLeft?: number
  nextFocusRight?: number
  nextFocusUp?: number
}

interface RadioGroupContextValue {
  getNavigationProps: (id: string) => RadioNavigationProps
  onBlur: (id: string) => void
  onFocus: (id: string, onSelect?: () => void) => void
  register: (id: string) => () => void
  setElement: (id: string, element: View | null) => void
  update: (state: Omit<RadioItemState, 'nativeHandle'>) => void
}

interface RadioItemElement {
  element: View
  nativeHandle: number | null
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

function navigationProps(
  id: string,
  enabledItems: readonly RadioItemState[],
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
    nextFocusLeft: previousHandle,
    nextFocusRight: nextHandle,
    nextFocusUp: previousHandle,
  }
}

export function RadioGroup({ children, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & { children: ReactNode }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const itemElementsRef = useRef(new Map<string, RadioItemElement>())
  const focusedItemIdRef = useRef<string | null>(null)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const register = useCallback((id: string) => {
    setItems((current) => [...current.filter((item) => item.id !== id), {
      disabled: false,
      id,
      index: 0,
      nativeHandle: itemElementsRef.current.get(id)?.nativeHandle ?? null,
      selected: false,
    }])
    return () => {
      itemElementsRef.current.delete(id)
      setItems((current) => current.filter((item) => item.id !== id))
    }
  }, [])
  const update = useCallback((state: Omit<RadioItemState, 'nativeHandle'>) => {
    setItems((current) => current.map((item) => item.id === state.id ? { ...item, ...state } : item))
  }, [])
  const setElement = useCallback((id: string, element: View | null) => {
    if (!element) return
    const nativeHandle = findNodeHandle(element)
    itemElementsRef.current.set(id, { element, nativeHandle })
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
    (id: string) => navigationProps(id, enabledItems),
    [enabledItems],
  )
  const onBlur = useCallback((id: string) => {
    if (focusedItemIdRef.current !== id) return
    blurTimerRef.current = setTimeout(() => {
      if (focusedItemIdRef.current === id) focusedItemIdRef.current = null
      blurTimerRef.current = null
    }, 0)
  }, [])
  const onFocus = useCallback((id: string, onSelect?: () => void) => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }

    const previouslyFocusedId = focusedItemIdRef.current
    focusedItemIdRef.current = id
    const focusedItem = enabledItems.find((item) => item.id === id)
    if (!focusedItem) return

    if (previouslyFocusedId !== null) {
      if (previouslyFocusedId !== id && !focusedItem.selected) onSelect?.()
      return
    }

    const selectedItem = enabledItems.find((item) => item.selected)
    if (selectedItem && selectedItem.id !== id) {
      itemElementsRef.current.get(selectedItem.id)?.element.focus()
    }
  }, [enabledItems])
  useLayoutEffect(() => () => {
    if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current)
  }, [])
  const contextValue = useMemo(() => ({
    getNavigationProps,
    onBlur,
    onFocus,
    register,
    setElement,
    update,
  }), [getNavigationProps, onBlur, onFocus, register, setElement, update])
  return (
    <RadioGroupContext.Provider value={contextValue}>
      <View {...props} accessibilityRole="radiogroup">{children}</View>
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
  const handleGroupBlur = group?.onBlur
  const handleGroupFocus = group?.onFocus
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
  const onBlur = useCallback(() => {
    handleGroupBlur?.(id)
  }, [handleGroupBlur, id])
  const onFocus = useCallback(() => {
    if (handleGroupFocus) {
      handleGroupFocus(id, onSelect)
      return
    }
    if (!disabled && !selected) onSelect?.()
  }, [disabled, handleGroupFocus, id, onSelect, selected])
  const groupNavigationProps = group?.getNavigationProps(id)

  return {
    elementRef,
    focusable: groupNavigationProps?.focusable ?? !disabled,
    nextFocusDown: groupNavigationProps?.nextFocusDown,
    nextFocusLeft: groupNavigationProps?.nextFocusLeft,
    nextFocusRight: groupNavigationProps?.nextFocusRight,
    nextFocusUp: groupNavigationProps?.nextFocusUp,
    onBlur,
    onFocus,
  }
}
