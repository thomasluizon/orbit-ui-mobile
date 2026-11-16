import React from 'react'
import { __measureInWindow } from './react-native'

function createSvgComponent(name: string) {
  return function MockSvgComponent({
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode
    [key: string]: unknown
  }>) {
    return React.createElement(name, props, children)
  }
}

function MockCircle(
  {
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode
    r?: number
    [key: string]: unknown
  }>,
  ref: React.ForwardedRef<{ getTotalLength: () => number }>,
) {
  React.useImperativeHandle(
    ref,
    () => ({ getTotalLength: () => 2 * Math.PI * Number(props.r ?? 0) }),
    [props.r],
  )
  return React.createElement('Circle', props, children)
}

/** The real `Svg` exposes `measureInWindow` on its ref; the mock measures through the react-native mock's hook. */
function MockSvg(
  {
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode
    [key: string]: unknown
  }>,
  ref: React.ForwardedRef<{ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }>,
) {
  React.useImperativeHandle(
    ref,
    () => ({ measureInWindow: (callback) => __measureInWindow(callback, props, 'Svg') }),
    [props],
  )
  return React.createElement('Svg', props, children)
}

export const Svg = React.forwardRef(MockSvg)

export const Circle = React.forwardRef(MockCircle)
export const ClipPath = createSvgComponent('ClipPath')
export const Defs = createSvgComponent('Defs')
export const G = createSvgComponent('G')
export const Line = createSvgComponent('Line')
export const Path = createSvgComponent('Path')
export const Rect = createSvgComponent('Rect')
export const Stop = createSvgComponent('Stop')

export default Svg
