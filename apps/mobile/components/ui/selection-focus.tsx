import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AccessibilityInfo,
  findNodeHandle,
  View,
  type ViewProps,
} from 'react-native'
import { usePreviousFocusTarget } from '@/components/ui/focus-provenance-view'

interface RadioItemState {
  disabled: boolean
  id: string
  nativeHandle: number | null
  selected: boolean
}

interface ArmedRedirect {
  fromTarget: number | null
  id: string
}

interface SelectionFocusContextValue {
  accessibilityHint?: string
  commit: () => void
  /** Null without a FocusProvenanceView ancestor, because entry and movement are then the same event. */
  onFocus: ((id: string, onSelect?: () => void) => void) | null
  register: (id: string, nativeHandle: number | null) => () => void
  setElement: (id: string, element: View, nativeHandle: number | null) => void
  select: (id: string) => void
  setHandler: (id: string, handler: () => void) => void
  value: string
  update: (state: Omit<RadioItemState, 'nativeHandle'>) => void
}

const SelectionFocusContext = createContext<SelectionFocusContextValue | null>(null)

export function SelectionFocusProvider({ children, onCommit, focusRequest, shouldFocus, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & {
    children: ReactNode
    /** Runs when a row is explicitly pressed, never when native focus moves the selection. */
    onCommit?: () => void
    focusRequest?: number
    shouldFocus?: () => boolean
  }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const handlersRef = useRef(new Map<string, () => void>())
  const elementsRef = useRef(new Map<string, View>())
  const handledFocusRequest = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!focusRequest || focusRequest === handledFocusRequest.current) return
    if (shouldFocus && !shouldFocus()) { handledFocusRequest.current = focusRequest; return }
    const firstEnabled = items.find((item) => !item.disabled && item.selected) ?? items.find((item) => !item.disabled)
    const firstElement = firstEnabled ? elementsRef.current.get(firstEnabled.id) : undefined
    if (!firstElement) return
    handledFocusRequest.current = focusRequest
    firstElement.setNativeProps({ hasTVPreferredFocus: true })
    AccessibilityInfo.sendAccessibilityEvent(firstElement, 'focus')
  }, [focusRequest, items, shouldFocus])
  const armedRedirectRef = useRef<ArmedRedirect | null>(null)
  const getPreviousFocusTarget = usePreviousFocusTarget()
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])
  const commit = useCallback(() => onCommitRef.current?.(), [])
  const register = useCallback((id: string, nativeHandle: number | null) => {
    setItems((current) => [...current.filter((item) => item.id !== id), {
      disabled: false,
      id,
      nativeHandle,
      selected: false,
    }])
    return () => {
      setItems((current) => current.filter((item) => item.id !== id))
      elementsRef.current.delete(id)
      handlersRef.current.delete(id)
    }
  }, [])
  const update = useCallback((state: Omit<RadioItemState, 'nativeHandle'>) => {
    setItems((current) => current.map((item) => item.id === state.id ? { ...item, ...state } : item))
  }, [])
  const setElement = useCallback((
    id: string,
    element: View,
    nativeHandle: number | null,
  ) => {
    elementsRef.current.set(id, element)
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      if (!item || item.nativeHandle === nativeHandle) return current
      return current.map((candidate) => candidate.id === id
        ? { ...candidate, nativeHandle }
        : candidate)
    })
  }, [])
  const handleFocus = useCallback((id: string, onSelect?: () => void) => {
    const focusedItem = items.find((item) => item.id === id && !item.disabled)
    if (!focusedItem || !getPreviousFocusTarget) return
    const previousTarget = getPreviousFocusTarget()
    const armedRedirect = armedRedirectRef.current
    armedRedirectRef.current = null
    const landedFromRedirect = armedRedirect?.id === id
      && armedRedirect.fromTarget === previousTarget
    if (landedFromRedirect) return

    const movedWithinGroup = previousTarget !== null
      && items.some((item) => item.nativeHandle === previousTarget)
    if (!movedWithinGroup) {
      const checkedItem = items.find((item) => item.selected && !item.disabled)
      if (checkedItem && checkedItem.id !== id) {
        armedRedirectRef.current = { fromTarget: focusedItem.nativeHandle, id: checkedItem.id }
        elementsRef.current.get(checkedItem.id)?.focus()
      }
      return
    }

    if (!focusedItem.selected) onSelect?.()
  }, [getPreviousFocusTarget, items])
  const onFocus = getPreviousFocusTarget ? handleFocus : null
  const setHandler = useCallback((id: string, handler: () => void) => { handlersRef.current.set(id, handler) }, [])
  const select = useCallback((id: string) => {
    if (!items.some((item) => item.id === id && item.selected)) handlersRef.current.get(id)?.()
  }, [items])
  const value = items.find((item) => item.selected)?.id ?? ''
  const accessibilityHint = props.accessibilityHint
  const contextValue = useMemo(() => ({
    accessibilityHint,
    select,
    setHandler,
    value,
    commit,
    onFocus,
    register,
    setElement,
    update,
  }), [accessibilityHint, commit, onFocus, register, select, setElement, setHandler, update, value])

  return (
    <SelectionFocusContext.Provider value={contextValue}>
      {children}
    </SelectionFocusContext.Provider>
  )
}

export function useSelectionFocusItem({
  disabled,
  onSelect,
  selected,
}: Readonly<{
  disabled: boolean
  onSelect?: () => void
  selected: boolean
}>) {
  const group = useContext(SelectionFocusContext)
  const registerWithGroup = group?.register
  const commitGroup = group?.commit
  const handleGroupFocus = group?.onFocus
  const setGroupElement = group?.setElement
  const updateGroup = group?.update
  const setHandler = group?.setHandler
  const id = useId()
  const nativeHandleRef = useRef<number | null>(null)

  useLayoutEffect(
    () => registerWithGroup?.(id, nativeHandleRef.current),
    [id, registerWithGroup],
  )
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, selected })
  }, [disabled, id, selected, updateGroup])

  useLayoutEffect(() => { setHandler?.(id, onSelect ?? (() => undefined)) }, [id, onSelect, setHandler])

  const elementRef = useCallback((element: View | null) => {
    if (!element) return
    const nativeHandle = findNodeHandle(element)
    nativeHandleRef.current = nativeHandle
    setGroupElement?.(id, element, nativeHandle)
  }, [id, setGroupElement])
  /** A group without focus provenance reads every focus as entry, so it falls back to the standalone rule rather than redirecting on every move. */
  const onFocus = useCallback(() => {
    if (handleGroupFocus) {
      handleGroupFocus(id, onSelect)
      return
    }
    if (!disabled && !selected) onSelect?.()
  }, [disabled, handleGroupFocus, id, onSelect, selected])
  return {
    id,
    onCommit: () => commitGroup?.(),
    accessibilityHint: group?.accessibilityHint,
    elementRef,
    focusable: !disabled,
    onFocus,
  }
}

export function useSelectionFocusGroup() {
  const group = useContext(SelectionFocusContext)
  if (!group) throw new Error('Selection options require a focus provider')
  return group
}

export function useHasSelectionFocusGroup() {
  return useContext(SelectionFocusContext) !== null
}
