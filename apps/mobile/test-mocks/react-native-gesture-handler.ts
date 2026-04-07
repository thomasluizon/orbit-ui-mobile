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

export default {
  GestureHandlerRootView,
  PanGestureHandler,
  TapGestureHandler,
}
