import React, { useEffect } from 'react'
import { createRequire } from 'node:module'
import type { LegacyTapGesture as TapGestureType, LegacyHoverGesture as HoverGestureType } from 'react-native-gesture-handler'

type NativeGestureType = ReturnType<typeof import('react-native-gesture-handler').Gesture.Native>

const loadGestureModule = createRequire(import.meta.url)
const { NativeGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/nativeGesture') as { NativeGesture: new () => NativeGestureType }
const { TapGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/tapGesture') as { TapGesture: new () => TapGestureType }
const { HoverGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/hoverGesture') as { HoverGesture: new () => HoverGestureType }
const { registerHandler, unregisterHandler } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/handlersRegistry') as {
  registerHandler: (tag: number, gesture: HoverGestureType) => void
  unregisterHandler: (tag: number) => void
}

function createHostComponent(name: string) {
  return function HostComponent({
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    [key: string]: unknown
  }>) {
    return React.createElement(name, props, typeof children === 'function' ? children({ pressed: false }) : children)
  }
}

export const GestureHandlerRootView = createHostComponent('GestureHandlerRootView')
export const PanGestureHandler = createHostComponent('PanGestureHandler')
export const TapGestureHandler = createHostComponent('TapGestureHandler')
export function GestureDetector({ children, gesture, ...props }: Readonly<{
  children?: React.ReactNode
  gesture: unknown
  [key: string]: unknown
}>) {
  useEffect(() => {
    if (!(gesture instanceof HoverGesture)) return
    gesture.initialize()
    registerHandler(gesture.handlerTag, gesture)
    return () => unregisterHandler(gesture.handlerTag)
  }, [gesture])
  const child = gesture instanceof HoverGesture
    ? React.cloneElement(React.Children.only(children) as React.ReactElement<{ collapsable?: boolean }>, { collapsable: false })
    : children
  return React.createElement('GestureDetector', { ...props, gesture }, child)
}
export const Pressable = createHostComponent('Pressable')

function createPanGestureBuilder() {
  const builder = {
    activeOffsetX: () => builder,
    failOffsetY: () => builder,
    onEnd: () => builder,
    onUpdate: () => builder,
    onBegin: () => builder,
  }
  return builder
}

export const Gesture = {
  Pan: createPanGestureBuilder,
  Hover: () => new HoverGesture(),
  Native: () => new NativeGesture(),
  Tap: () => new TapGesture(),
}

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  GestureDetector,
  Gesture,
  Pressable,
}
