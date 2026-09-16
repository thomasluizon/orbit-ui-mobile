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
import { type NativeSyntheticEvent, View, type ViewProps } from 'react-native'
import { getRadioNavigationIndex } from '@orbit/shared/utils'

interface RadioItemState {
  disabled: boolean
  id: string
  selected: boolean
}

interface RadioGroupContextValue {
  getTabIndex: (id: string) => 0 | -1
  moveSelection: (id: string, key: string) => boolean
  register: (id: string) => () => void
  setElement: (id: string, element: View | null) => void
  setHandler: (id: string, handler: () => void) => void
  update: (state: RadioItemState) => void
}

type RadioKeyEvent = NativeSyntheticEvent<{ key: string }>

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export function RadioGroup({ children, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & { children: ReactNode }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const elementsRef = useRef(new Map<string, View>())
  const handlersRef = useRef(new Map<string, () => void>())
  const register = useCallback((id: string) => {
    setItems((current) => [...current.filter((item) => item.id !== id), { disabled: false, id, selected: false }])
    return () => {
      setItems((current) => current.filter((item) => item.id !== id))
      elementsRef.current.delete(id)
      handlersRef.current.delete(id)
    }
  }, [])
  const update = useCallback((state: RadioItemState) => {
    setItems((current) => current.map((item) => item.id === state.id ? state : item))
  }, [])
  const setElement = useCallback((id: string, element: View | null) => {
    if (element) elementsRef.current.set(id, element)
    else elementsRef.current.delete(id)
  }, [])
  const setHandler = useCallback((id: string, handler: () => void) => {
    handlersRef.current.set(id, handler)
  }, [])
  const enabledItems = items.filter((item) => !item.disabled)
  const getTabIndex = useCallback((id: string): 0 | -1 => {
    const selectedItem = enabledItems.find((item) => item.selected)
    return (selectedItem ?? enabledItems[0])?.id === id ? 0 : -1
  }, [enabledItems])
  const moveSelection = useCallback((id: string, key: string) => {
    const currentIndex = enabledItems.findIndex((item) => item.id === id)
    if (currentIndex < 0) return false
    const nextIndex = getRadioNavigationIndex(key, currentIndex, enabledItems.length)
    if (nextIndex === null) return false
    const nextItem = enabledItems[nextIndex]
    if (!nextItem) return false
    elementsRef.current.get(nextItem.id)?.focus()
    handlersRef.current.get(nextItem.id)?.()
    return true
  }, [enabledItems])
  const contextValue = useMemo(() => ({
    getTabIndex,
    moveSelection,
    register,
    setElement,
    setHandler,
    update,
  }), [getTabIndex, moveSelection, register, setElement, setHandler, update])

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <View {...props} accessibilityRole="radiogroup">{children}</View>
    </RadioGroupContext.Provider>
  )
}

export function useRadioGroupItem({
  disabled,
  onSelect,
  selected,
}: Readonly<{
  disabled: boolean
  onSelect?: () => void
  selected: boolean
}>) {
  const group = useContext(RadioGroupContext)
  const registerWithGroup = group?.register
  const getGroupTabIndex = group?.getTabIndex
  const moveGroupSelection = group?.moveSelection
  const setGroupElement = group?.setElement
  const setGroupHandler = group?.setHandler
  const updateGroup = group?.update
  const id = useId()

  useLayoutEffect(() => registerWithGroup?.(id), [id, registerWithGroup])
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, selected })
  }, [disabled, id, selected, updateGroup])
  useLayoutEffect(() => {
    setGroupHandler?.(id, onSelect ?? (() => undefined))
  }, [id, onSelect, setGroupHandler])

  const onKeyDown = useCallback((event: RadioKeyEvent) => {
      if (!moveGroupSelection?.(id, event.nativeEvent.key)) return
      event.preventDefault()
  }, [id, moveGroupSelection])
  const elementRef = useCallback((element: View | null) => {
    setGroupElement?.(id, element)
  }, [id, setGroupElement])
  const tabIndex = getGroupTabIndex?.(id) ?? 0

  return { elementRef, onKeyDown, tabIndex }
}
