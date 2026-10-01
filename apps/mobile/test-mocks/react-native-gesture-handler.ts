import React from 'react'
import { createRequire } from 'node:module'
import type { NativeGesture as NativeGestureType, TapGesture as TapGestureType } from 'react-native-gesture-handler'

const loadGestureModule = createRequire(import.meta.url)
const { NativeGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/nativeGesture') as { NativeGesture: new () => NativeGestureType }
const { TapGesture } = loadGestureModule('react-native-gesture-handler/lib/commonjs/handlers/gestures/tapGesture') as { TapGesture: new () => TapGestureType }

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
export const GestureDetector = createHostComponent('GestureDetector')
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
