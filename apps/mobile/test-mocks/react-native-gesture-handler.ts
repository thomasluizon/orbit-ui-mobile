import React from 'react'

function createHostComponent(name: string) {
  return function HostComponent({
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode
    [key: string]: unknown
  }>) {
    return React.createElement(name, props, children)
  }
}

export const GestureHandlerRootView = createHostComponent('GestureHandlerRootView')
export const PanGestureHandler = createHostComponent('PanGestureHandler')
export const TapGestureHandler = createHostComponent('TapGestureHandler')
export const GestureDetector = createHostComponent('GestureDetector')

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
}

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
  GestureDetector,
  Gesture,
}
