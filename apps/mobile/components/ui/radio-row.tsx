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
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { usePreviousFocusTarget } from '@/components/ui/focus-provenance-view'

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

interface ArmedRedirect {
  fromTarget: number | null
  id: string
}

interface RadioGroupContextValue {
  commit: () => void
  getNavigationProps: (id: string) => RadioNavigationProps
  onFocus: (id: string, onSelect?: () => void) => void
  register: (id: string, nativeHandle: number | null) => () => void
  setElement: (id: string, element: View, nativeHandle: number | null) => void
  update: (state: Omit<RadioItemState, 'nativeHandle'>) => void
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
      index: 0,
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
  const enabledItems = useMemo(() => [...items]
    .sort((first, second) => first.index - second.index)
    .filter((item) => !item.disabled), [items])
  const getNavigationProps = useCallback(
    (id: string) => navigationProps(id, enabledItems),
    [enabledItems],
  )
  const onFocus = useCallback((id: string, onSelect?: () => void) => {
    const focusedItem = enabledItems.find((item) => item.id === id)
    if (!focusedItem) return
    const previousTarget = getPreviousFocusTarget?.() ?? null
    const armedRedirect = armedRedirectRef.current
    armedRedirectRef.current = null
    const landedFromRedirect = armedRedirect?.id === id
      && armedRedirect.fromTarget === previousTarget
    if (landedFromRedirect) return

    const movedWithinGroup = previousTarget !== null
      && items.some((item) => item.nativeHandle === previousTarget)
    if (!movedWithinGroup) {
      const entryItem = enabledItems.find((item) => item.selected) ?? enabledItems[0]
      if (entryItem && entryItem.id !== id) {
        armedRedirectRef.current = { fromTarget: focusedItem.nativeHandle, id: entryItem.id }
        elementsRef.current.get(entryItem.id)?.focus()
      }
      return
    }

    if (!focusedItem.selected) onSelect?.()
  }, [enabledItems, getPreviousFocusTarget, items])
  const contextValue = useMemo(() => ({
    commit,
    getNavigationProps,
    onFocus,
    register,
    setElement,
    update,
  }), [commit, getNavigationProps, onFocus, register, setElement, update])
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
    updateGroup?.({ disabled, id, index, selected })
  }, [disabled, id, index, selected, updateGroup])

  const elementRef = useCallback((element: View | null) => {
    if (!element) return
    const nativeHandle = findNodeHandle(element)
    nativeHandleRef.current = nativeHandle
    setGroupElement?.(id, element, nativeHandle)
  }, [id, setGroupElement])
  const onFocus = useCallback(() => {
    if (handleGroupFocus) {
      handleGroupFocus(id, onSelect)
      return
    }
    if (!disabled && !selected) onSelect?.()
  }, [disabled, handleGroupFocus, id, onSelect, selected])
  /** The press is the only commit path, so native focus movement can change the value without closing a host. */
  const onActivate = useCallback(() => {
    onSelect?.()
    commitGroup?.()
  }, [commitGroup, onSelect])
  const groupNavigationProps = group?.getNavigationProps(id)

  return {
    elementRef,
    focusable: groupNavigationProps?.focusable ?? !disabled,
    nextFocusDown: groupNavigationProps?.nextFocusDown,
    nextFocusLeft: groupNavigationProps?.nextFocusLeft,
    nextFocusRight: groupNavigationProps?.nextFocusRight,
    nextFocusUp: groupNavigationProps?.nextFocusUp,
    onActivate,
    onFocus,
  }
}

export function RadioRow({ index, label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason }: Readonly<RadioRowProps & { index: number }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { elementRef, onActivate, ...navigationProps } = useRadioGroupItem({
    disabled,
    index,
    onSelect,
    selected,
  })
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.textBlock}>
        <Text style={[styles.label, { color: tokens.fg1 }]}>{label}</Text>
        {description ? <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text> : null}
        {disabled && reason ? <Text style={[styles.reason, { color: tokens.fg3 }]}>{reason}</Text> : null}
      </View>
      {meta ? <Text style={[styles.meta, { color: tokens.fg3 }]}>{meta}</Text> : null}
      {tag ? <Text style={[styles.tag, { color: tokens.fg3 }]}>{tag}</Text> : null}
      <View style={[styles.radio, selected ? { backgroundColor: tokens.primary } : { borderColor: tokens.hairlineStrong, borderWidth: 1.5 }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: tokens.fgOnPrimary }]} /> : null}
      </View>
    </>
  )
  const rowStyle = [
    styles.row,
    {
      paddingLeft: 20 + Math.max(0, depth) * 20,
      backgroundColor: selected ? tokens.selectionBg : 'transparent',
      borderColor: selected ? tokens.primary : 'transparent',
      opacity: disabled ? 0.5 : 1,
    },
  ]

  return disabled ? (
    <View {...navigationProps} ref={elementRef} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: true }} style={rowStyle}>{content}</View>
  ) : (
    <Pressable
      {...navigationProps}
      ref={elementRef}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onActivate}
      style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.99 }] } : null]}
    >{content}</Pressable>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, paddingRight: 16, paddingVertical: 8, borderWidth: 1.5, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  leading: { width: 30, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  label: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 20.8 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  reason: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16.8 },
  meta: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tag: { fontFamily: 'Geist_600SemiBold', fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase', flexShrink: 0 },
  radio: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  radioDot: { width: 9, height: 9, borderRadius: 999 },
})
