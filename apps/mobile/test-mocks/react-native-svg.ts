import React from 'react'

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

const Svg = createSvgComponent('Svg')

export const Circle = React.forwardRef(MockCircle)
export const Defs = createSvgComponent('Defs')
export const G = createSvgComponent('G')
export const Line = createSvgComponent('Line')
export const Path = createSvgComponent('Path')
export const Rect = createSvgComponent('Rect')
export const Stop = createSvgComponent('Stop')

export default Svg
