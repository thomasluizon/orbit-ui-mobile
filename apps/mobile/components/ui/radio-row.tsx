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

interface RadioGroupContextValue {
  commit: () => void
  /** Null without a FocusProvenanceView ancestor, because entry and movement are then the same event. */
  onFocus: ((id: string, onSelect?: () => void) => void) | null
  register: (id: string, nativeHandle: number | null) => () => void
  setElement: (id: string, element: View, nativeHandle: number | null) => void
  update: (state: Omit<RadioItemState, 'nativeHandle'>) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export function RadioGroup({ children, onCommit, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & {
    children: ReactNode
    /** Runs when a row is explicitly pressed, never when native focus moves the selection. */
    onCommit?: () => void
  }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const elementsRef = useRef(new Map<string, View>())
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
  const contextValue = useMemo(() => ({
    commit,
    onFocus,
    register,
    setElement,
    update,
  }), [commit, onFocus, register, setElement, update])

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
  const commitGroup = group?.commit
  const handleGroupFocus = group?.onFocus
  const setGroupElement = group?.setElement
  const updateGroup = group?.update
  const id = useId()
  const nativeHandleRef = useRef<number | null>(null)

  useLayoutEffect(
    () => registerWithGroup?.(id, nativeHandleRef.current),
    [id, registerWithGroup],
  )
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, selected })
  }, [disabled, id, selected, updateGroup])

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
  /** The press is the only commit path, and a D-pad centre press on the focused row already selected it. */
  const onActivate = useCallback(() => {
    if (!selected) onSelect?.()
    commitGroup?.()
  }, [commitGroup, onSelect, selected])

  return {
    elementRef,
    focusable: !disabled,
    onActivate,
    onFocus,
  }
}
