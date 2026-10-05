import React from 'react'

type HostProps = Readonly<{
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
  onFocus?: (event: { nativeEvent: { target: number } }) => void
  onBlur?: (event: { nativeEvent: { target: number } }) => void
  onPressIn?: () => void
  onPressOut?: () => void
  [key: string]: unknown
}>

type MeasureInWindowCallback = (
  x: number,
  y: number,
  width: number,
  height: number,
) => void
type MeasureInWindowImpl = (callback: MeasureInWindowCallback) => void
type ScrollToImpl = (options: {
  x?: number
  y?: number
  animated?: boolean
}) => void
type FocusImpl = (props: HostProps) => void

const DEFAULT_MEASURE_IN_WINDOW: MeasureInWindowImpl = (callback) =>
  callback(0, 0, 32, 32)

let measureInWindowImpl: MeasureInWindowImpl = DEFAULT_MEASURE_IN_WINDOW
let scrollToImpl: ScrollToImpl = () => {}
let focusImpl: FocusImpl = () => {}
let hostRefsNull = false
let nextNativeTag = 1
type NativeHost = {
  name: string
  props: HostProps
  ancestors: number[]
  focusableInTouchMode: boolean
}
const nativeHosts = new Map<number, NativeHost>()
const HostAncestors = React.createContext<number[]>([])
let focusedNativeTag: number | null = null
let touchMode = true
const DEFAULT_WINDOW_DIMENSIONS = { width: 412, height: 892, scale: 1, fontScale: 1 }
let windowDimensions = DEFAULT_WINDOW_DIMENSIONS

export function __setMeasureInWindowImpl(impl: MeasureInWindowImpl) {
  measureInWindowImpl = impl
}

export function __setHostRefsNull(value: boolean) {
  hostRefsNull = value
}

export function __setScrollToImpl(impl: ScrollToImpl) {
  scrollToImpl = impl
}

export function __setFocusImpl(impl: FocusImpl) {
  focusImpl = impl
}

export function __setTouchMode(value: boolean) {
  touchMode = value
}

export function __getFocusedNativeTag() {
  return focusedNativeTag
}

function emitNativeFocusEvent(nativeTag: number, event: 'onFocus' | 'onBlur') {
  const host = nativeHosts.get(nativeTag)
  if (!host) return
  for (const tag of [nativeTag, ...[...host.ancestors].reverse()]) {
    const handler = nativeHosts.get(tag)?.props[event]
    handler?.({ nativeEvent: { target: nativeTag } })
  }
}

export function __focusHost(nativeTag: number) {
  const host = nativeHosts.get(nativeTag)
  if (!host) return
  const accessibilityState = host.props.accessibilityState as { disabled?: boolean } | undefined
  const enabled = !accessibilityState?.disabled && host.props.disabled !== true
    && (host.name !== 'TextInput' || host.props.editable !== false)
  const focusable = host.name === 'TextInput' || host.name === 'Pressable' || host.props.focusable === true
    || host.focusableInTouchMode
  if (!enabled || !focusable || (touchMode && !host.focusableInTouchMode)) return
  if (focusedNativeTag === nativeTag) return
  if (focusedNativeTag !== null) emitNativeFocusEvent(focusedNativeTag, 'onBlur')
  focusedNativeTag = nativeTag
  focusImpl(host.props)
  emitNativeFocusEvent(nativeTag, 'onFocus')
}

export function __setWindowDimensions(
  nextDimensions: Readonly<typeof DEFAULT_WINDOW_DIMENSIONS>,
) {
  windowDimensions = nextDimensions
}

const keyboardListeners = new Map<string, Set<(payload: unknown) => void>>()

export function __resetTestHostConfig() {
  measureInWindowImpl = DEFAULT_MEASURE_IN_WINDOW
  scrollToImpl = () => {}
  focusImpl = () => {}
  hostRefsNull = false
  nextNativeTag = 1
  nativeHosts.clear()
  focusedNativeTag = null
  touchMode = true
  windowDimensions = DEFAULT_WINDOW_DIMENSIONS
  keyboardListeners.clear()
}

function createHostComponent(name: string) {
  const HostComponent = React.forwardRef<unknown, HostProps>(function HostComponent(
    { children, ...props }: HostProps,
    ref,
  ) {
    const [nativeTag] = React.useState(() => nextNativeTag++)
    const [pressed, setPressed] = React.useState(false)
    const ancestors = React.useContext(HostAncestors)
    React.useLayoutEffect(() => {
      const existing = nativeHosts.get(nativeTag)
      nativeHosts.set(nativeTag, {
        name, props, ancestors,
        focusableInTouchMode: existing?.focusableInTouchMode ?? name === 'TextInput',
      })
    })
    React.useLayoutEffect(() => () => {
      nativeHosts.delete(nativeTag)
      if (focusedNativeTag === nativeTag) focusedNativeTag = null
    }, [nativeTag])
    React.useImperativeHandle(hostRefsNull ? null : ref, () => ({
      __nativeTag: nativeTag,
      measure: (callback?: (...args: number[]) => void) => callback?.(0, 0, 32, 32, 0, 0),
      measureInWindow: (callback?: MeasureInWindowCallback) => {
        if (callback) measureInWindowImpl(callback)
      },
      setNativeProps: (updates: HostProps) => {
        const host = nativeHosts.get(nativeTag)
        if (!host) return
        host.props = { ...host.props, ...updates }
        if (updates.hasTVPreferredFocus === true) {
          host.focusableInTouchMode = true
          __focusHost(nativeTag)
        }
      },
      focus: () => __focusHost(nativeTag),
      blur: () => {
        if (focusedNativeTag !== nativeTag) return
        emitNativeFocusEvent(nativeTag, 'onBlur')
        focusedNativeTag = null
      },
      scrollTo: scrollToImpl,
      scrollToEnd: () => {},
    }), [nativeTag])

    return React.createElement(HostAncestors.Provider, { value: [...ancestors, nativeTag] },
      React.createElement(name, {
        ...props,
        __nativeTag: nativeTag,
        ...(name === 'Pressable' ? {
          onPressIn: () => {
            setPressed(true)
            if (typeof props.onPressIn === 'function') props.onPressIn()
          },
          onPressOut: () => {
            setPressed(false)
            if (typeof props.onPressOut === 'function') props.onPressOut()
          },
        } : {}),
      },
        typeof children === 'function' && name === 'Pressable' ? children({ pressed }) : children as React.ReactNode),
    )
  })

  HostComponent.displayName = name
  return HostComponent
}

const View = createHostComponent('View')
const Text = createHostComponent('Text')
const TouchableOpacity = createHostComponent('TouchableOpacity')
const Pressable = createHostComponent('Pressable')
const ScrollView = createHostComponent('ScrollView')
const FlatList = createHostComponent('FlatList')
const RefreshControl = createHostComponent('RefreshControl')
const TextInput = createHostComponent('TextInput')
const Switch = createHostComponent('Switch')
const Image = createHostComponent('Image')
const Modal = createHostComponent('Modal')
const ActivityIndicator = createHostComponent('ActivityIndicator')
const AnimatedView = createHostComponent('AnimatedView')
const AnimatedText = createHostComponent('AnimatedText')
const KeyboardAvoidingView = createHostComponent('KeyboardAvoidingView')

export const Animated = {
  Value: class AnimatedValue {
    constructor(public value: number) {}

    setValue(nextValue: number) {
      this.value = nextValue
    }

    stopAnimation(callback?: (value: number) => void) {
      callback?.(this.value)
    }

    interpolate<T>(config: { outputRange: T[] }) {
      return config.outputRange[0]
    }
  },
  View: AnimatedView,
  Text: AnimatedText,
  timing: () => ({ start: () => {}, stop: () => {} }),
  spring: () => ({ start: () => {}, stop: () => {} }),
  sequence: (animations: { start?: () => void; stop?: () => void }[]) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  parallel: (animations: { start?: () => void; stop?: () => void }[]) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  loop: (animation: { start?: () => void; stop?: () => void }) => animation,
  event: () => () => {},
  createAnimatedComponent: <C>(component: C): C => component,
}

export const PanResponder = {
  create: () => ({ panHandlers: {} }),
}

export const Dimensions = {
  get: (_dimension: 'window' | 'screen') => windowDimensions,
  addEventListener: (
    _event: string,
    _listener: (...args: unknown[]) => void,
  ) => ({
    remove: () => {},
  }),
}

/** The theme layer reads the OS scheme; tests pin it so a render never depends on the host. */
export function useColorScheme(): 'light' | 'dark' {
  return 'dark'
}

export function useWindowDimensions() {
  return windowDimensions
}

export const Easing = {
  out: <T>(value: T) => value,
  cubic: 'cubic',
  bezier: () => (value: number) => value,
}

export const AppState = {
  currentState: 'active' as 'active' | 'background' | 'inactive',
  addEventListener: (_event: string, _listener: (status: string) => void) => ({
    remove: () => {},
  }),
}

const backHandlerListeners = new Set<() => boolean>()

export const BackHandler = {
  addEventListener: (_event: string, listener: () => boolean) => {
    backHandlerListeners.add(listener)
    return {
      remove: () => {
        backHandlerListeners.delete(listener)
      },
    }
  },
  exitApp: () => {},
  emitBackPress: (): boolean => {
    for (const listener of [...backHandlerListeners].reverse()) {
      if (listener()) return true
    }
    return false
  },
}

export const AccessibilityInfo = {
  isReduceMotionEnabled: () => Promise.resolve(false),
  addEventListener: (_event: string, _listener: (enabled: boolean) => void) => ({
    remove: () => {},
  }),
  announceForAccessibility: (_announcement: string) => {},
  setAccessibilityFocus: (_reactTag: number) => {},
  sendAccessibilityEvent: (_handle: unknown, _eventType: 'focus' | 'click' | 'viewHoverEnter') => {},
}

export const Vibration = {
  vibrate: (_duration: number) => {},
}

export const Keyboard = {
  addListener: (event: string, listener: (payload: unknown) => void) => {
    const listeners = keyboardListeners.get(event) ?? new Set<(payload: unknown) => void>()
    listeners.add(listener)
    keyboardListeners.set(event, listeners)
    return {
      remove: () => {
        listeners.delete(listener)
      },
    }
  },
  dismiss: () => {},
  scheduleLayoutAnimation: () => {},
}

export function __emitKeyboardEvent(event: string, payload?: unknown) {
  for (const listener of keyboardListeners.get(event) ?? []) {
    listener(payload)
  }
}

export function findNodeHandle(input: unknown): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return input
  if (typeof input === 'object' && '__nativeTag' in input) {
    const nativeTag = (input as { __nativeTag?: unknown }).__nativeTag
    return typeof nativeTag === 'number' ? nativeTag : null
  }
  return null
}

export const Platform = {
  OS: 'android',
  select: <T,>(values: { android?: T; default?: T }) => values.android ?? values.default,
}

export const StyleSheet = {
  get hairlineWidth() {
    const scale = windowDimensions.scale
    return Math.round(0.4 * scale) / scale || 1 / scale
  },
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: (style: unknown): unknown => {
    if (style === null || typeof style !== 'object') return undefined
    if (!Array.isArray(style)) return style

    return style.reduce<Record<string, unknown>>((flattened, entry) => {
      const computedStyle = StyleSheet.flatten(entry)
      return computedStyle && typeof computedStyle === 'object'
        ? Object.assign(flattened, computedStyle)
        : flattened
    }, {})
  },
}

export const LayoutAnimation = {
  configureNext: () => {},
  Presets: {
    easeInEaseOut: {},
  },
}

export {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
}

export default {
  ActivityIndicator,
  Animated,
  AppState,
  AccessibilityInfo,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  useWindowDimensions,
  findNodeHandle,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
}
