import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ForwardRefExoticComponent,
  type ReactNode,
  type RefAttributes,
} from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from 'react-native'
import type { RadioRowProps } from '@orbit/shared/contracts/lists'
import { getRadioNavigationIndex } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface FocusableRadio {
  focus?: () => void
}

interface RadioKeyEvent {
  nativeEvent: { key: string }
  preventDefault: () => void
}

const KeyboardPressable = Pressable as ForwardRefExoticComponent<
  PressableProps & RefAttributes<FocusableRadio> & {
    onKeyDown?: (event: RadioKeyEvent) => void
  }
>

interface RadioItemState {
  disabled: boolean
  id: string
  navigationOrder: number
  selected: boolean
}

interface RadioGroupContextValue {
  getTabIndex: (id: string) => 0 | -1
  moveSelection: (id: string, key: string) => boolean
  register: (id: string, navigationOrder?: number) => () => void
  setElement: (id: string, element: FocusableRadio | null) => void
  setHandler: (id: string, handler: () => void) => void
  update: (state: RadioItemState) => void
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null)

export function RadioGroup({ children, ...props }: Readonly<
  Omit<ViewProps, 'accessibilityRole'> & { children: ReactNode }
>) {
  const [items, setItems] = useState<RadioItemState[]>([])
  const elementsRef = useRef(new Map<string, FocusableRadio>())
  const handlersRef = useRef(new Map<string, () => void>())
  const register = useCallback((id: string, navigationOrder?: number) => {
    setItems((current) => [...current.filter((item) => item.id !== id), {
      disabled: false,
      id,
      navigationOrder: navigationOrder ?? current.length,
      selected: false,
    }])
    return () => {
      setItems((current) => current.filter((item) => item.id !== id))
      elementsRef.current.delete(id)
      handlersRef.current.delete(id)
    }
  }, [])
  const update = useCallback((state: RadioItemState) => {
    setItems((current) => current.map((item) => item.id === state.id ? state : item))
  }, [])
  const setElement = useCallback((id: string, element: FocusableRadio | null) => {
    if (element) elementsRef.current.set(id, element)
    else elementsRef.current.delete(id)
  }, [])
  const setHandler = useCallback((id: string, handler: () => void) => {
    handlersRef.current.set(id, handler)
  }, [])
  const enabledItems = useMemo(() => items
    .filter((item) => !item.disabled)
    .sort((first, second) => first.navigationOrder - second.navigationOrder), [items])
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
    elementsRef.current.get(nextItem.id)?.focus?.()
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

export function RadioRow({ label, description, selected = false, onSelect, leading, depth = 0, meta, tag, disabled = false, reason, navigationOrder }: Readonly<RadioRowProps & { navigationOrder?: number }>) {
  const group = useContext(RadioGroupContext)
  const registerWithGroup = group?.register
  const setGroupHandler = group?.setHandler
  const updateGroup = group?.update
  const id = useId()
  useLayoutEffect(
    () => registerWithGroup?.(id, navigationOrder),
    [id, navigationOrder, registerWithGroup],
  )
  useLayoutEffect(() => {
    updateGroup?.({ disabled, id, navigationOrder: navigationOrder ?? 0, selected })
  }, [disabled, id, navigationOrder, selected, updateGroup])
  useLayoutEffect(() => {
    setGroupHandler?.(id, onSelect ?? (() => undefined))
  }, [id, onSelect, setGroupHandler])

  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
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
    <View accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: true }} style={rowStyle}>{content}</View>
  ) : (
    <KeyboardPressable
      ref={(element) => group?.setElement(id, element)}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      tabIndex={group?.getTabIndex(id) ?? 0}
      onKeyDown={(event) => {
        // WHY: KeyEvent.kt lines 149-152 map only arrows: https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/events/KeyEvent.kt#L149-L152
        if (!group?.moveSelection(id, event.nativeEvent.key)) return
        event.preventDefault()
      }}
      onPress={onSelect}
      style={({ pressed }) => [...rowStyle, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.99 }] } : null]}
    >{content}</KeyboardPressable>
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
