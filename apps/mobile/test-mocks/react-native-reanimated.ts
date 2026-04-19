import React from 'react'

function makeAnimatedComponent(name: string) {
  return function MockAnimatedComponent({
    children,
    ...props
  }: Readonly<{
    children?: React.ReactNode
    [key: string]: unknown
  }>) {
    return React.createElement(name, props, children)
  }
}

const Reanimated = {
  View: makeAnimatedComponent('AnimatedView'),
  Text: makeAnimatedComponent('AnimatedText'),
  ScrollView: makeAnimatedComponent('AnimatedScrollView'),
  Image: makeAnimatedComponent('AnimatedImage'),
  createAnimatedComponent: <T,>(component: T): T => component,
}

export function useSharedValue<Value>(value: Value) {
  return { value }
}

export function useAnimatedStyle<T>(updater: () => T): T {
  try {
    return updater()
  } catch {
    return {} as T
  }
}

export function useDerivedValue<Value>(updater: () => Value) {
  const value = updater()
  return { value }
}

export function useAnimatedScrollHandler() {
  return () => {}
}

export function withTiming<Value>(value: Value) {
  return value
}

export function withSpring<Value>(value: Value) {
  return value
}

export function withDelay<Value>(_delayMs: number, value: Value) {
  return value
}

export function withRepeat<Value>(value: Value, _count?: number, _reverse?: boolean) {
  return value
}

export function withSequence<Value>(...values: Value[]) {
  return values[values.length - 1] as Value
}

export function interpolate(
  _value: number,
  _inputRange: number[],
  outputRange: number[],
): number {
  return outputRange[0] ?? 0
}

export function cancelAnimation(_sharedValue: unknown) {
  // no-op
}

export const Easing = {
  bezier: (_a: number, _b: number, _c: number, _d: number) => (t: number) => t,
  linear: (t: number) => t,
  ease: (t: number) => t,
  in: (easing: (t: number) => number) => easing,
  out: (easing: (t: number) => number) => easing,
  inOut: (easing: (t: number) => number) => easing,
}

export const ReduceMotion = {
  System: 'system',
  Always: 'always',
  Never: 'never',
}

export function runOnJS<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
) {
  return (...args: Args) => callback(...args)
}

export function createAnimatedComponent<Component>(component: Component): Component {
  return component
}

export default Reanimated
