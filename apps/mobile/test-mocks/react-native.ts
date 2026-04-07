import React from 'react'

type HostProps = Readonly<{
  children?: React.ReactNode
  [key: string]: unknown
}>

function createHostComponent(name: string) {
  const HostComponent = React.forwardRef<unknown, HostProps>(function HostComponent(
    { children, ...props },
    ref,
  ) {
    const hostRef = {
      measure: (callback?: (...args: number[]) => void) => callback?.(0, 0, 32, 32, 0, 0),
      measureInWindow: (callback?: (...args: number[]) => void) => callback?.(0, 0, 32, 32),
      setNativeProps: () => {},
    }

    if (typeof ref === 'function') {
      ref(hostRef)
    } else if (ref && typeof ref === 'object') {
      ;(ref as { current: unknown }).current = hostRef
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
const Image = createHostComponent('Image')
const Modal = createHostComponent('Modal')
const ActivityIndicator = createHostComponent('ActivityIndicator')
const AnimatedView = createHostComponent('AnimatedView')

export const Animated = {
  Value: class AnimatedValue {
    constructor(public value: number) {}

    setValue(nextValue: number) {
      this.value = nextValue
    }

    interpolate<T>(config: { outputRange: T[] }) {
      return config.outputRange[0]
    }
  },
  View: AnimatedView,
  timing: () => ({ start: () => {}, stop: () => {} }),
  sequence: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  parallel: (animations: Array<{ start?: () => void; stop?: () => void }>) => ({
    start: () => animations.forEach((animation) => animation.start?.()),
    stop: () => animations.forEach((animation) => animation.stop?.()),
  }),
  loop: (animation: { start?: () => void; stop?: () => void }) => animation,
  event: () => () => {},
}

export const Easing = {
  out: <T>(value: T) => value,
  cubic: 'cubic',
}

export const Platform = {
  OS: 'android',
  select: <T,>(values: { android?: T; default?: T }) => values.android ?? values.default,
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: (style: unknown) => style,
}

export {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
}

export default {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
}
