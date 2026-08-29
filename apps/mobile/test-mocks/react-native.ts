import React from 'react'

type HostProps = Readonly<{
  children?: React.ReactNode
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

const DEFAULT_MEASURE_IN_WINDOW: MeasureInWindowImpl = (callback) =>
  callback(0, 0, 32, 32)

let measureInWindowImpl: MeasureInWindowImpl = DEFAULT_MEASURE_IN_WINDOW
let scrollToImpl: ScrollToImpl = () => {}
let hostRefsNull = false

export function __setMeasureInWindowImpl(impl: MeasureInWindowImpl) {
  measureInWindowImpl = impl
}

export function __setHostRefsNull(value: boolean) {
  hostRefsNull = value
}

export function __setScrollToImpl(impl: ScrollToImpl) {
  scrollToImpl = impl
}

const keyboardListeners = new Map<string, Set<(payload: unknown) => void>>()

export function __resetTestHostConfig() {
  measureInWindowImpl = DEFAULT_MEASURE_IN_WINDOW
  scrollToImpl = () => {}
  hostRefsNull = false
  keyboardListeners.clear()
}

function createHostComponent(name: string) {
  const HostComponent = React.forwardRef<unknown, HostProps>(function HostComponent(
    { children, ...props },
    ref,
  ) {
    const hostRef = {
      measure: (callback?: (...args: number[]) => void) => callback?.(0, 0, 32, 32, 0, 0),
      measureInWindow: (callback?: MeasureInWindowCallback) => {
        if (callback) measureInWindowImpl(callback)
      },
      setNativeProps: () => {},
      focus: () => {},
      blur: () => {},
      scrollTo: scrollToImpl,
      scrollToEnd: () => {},
    }

    if (!hostRefsNull) {
      if (typeof ref === 'function') {
        // react-doctor-disable-next-line no-prop-callback-in-render -- Test-only mock of a React Native host component; it synchronously assigns the ref callback to emulate native measure()/setNativeProps() behavior for Vitest. Not a production render path. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
        ref(hostRef)
      } else if (ref && typeof ref === 'object') {
        ;(ref as { current: unknown }).current = hostRef
      }
    }

    return React.createElement(name, props, children as React.ReactNode)
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
  get: (_dimension: 'window' | 'screen') => ({ width: 412, height: 892 }),
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
  return { width: 412, height: 892, scale: 1, fontScale: 1 }
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
  return 1
}

export const Platform = {
  OS: 'android',
  select: <T,>(values: { android?: T; default?: T }) => values.android ?? values.default,
}

export const StyleSheet = {
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
