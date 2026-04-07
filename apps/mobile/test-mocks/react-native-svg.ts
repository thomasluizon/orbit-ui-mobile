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

const Svg = createSvgComponent('Svg')

export const Circle = createSvgComponent('Circle')
export const Defs = createSvgComponent('Defs')
export const Line = createSvgComponent('Line')
export const LinearGradient = createSvgComponent('LinearGradient')
export const Path = createSvgComponent('Path')
export const Rect = createSvgComponent('Rect')
export const Stop = createSvgComponent('Stop')

export default Svg
