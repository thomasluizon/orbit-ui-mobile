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
  FlatList: makeAnimatedComponent('FlatList'),
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

export function useAnimatedProps<T>(updater: () => T): T {
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

export const withTimingCalls: { value: unknown; config: unknown }[] = []
export const withDelayCalls: { delayMs: number; value: unknown }[] = []

export function withTiming<Value>(value: Value, config?: unknown) {
  withTimingCalls.push({ value, config })
  return value
}

export function withSpring<Value>(value: Value) {
  return value
}

export function withDelay<Value>(delayMs: number, value: Value) {
  withDelayCalls.push({ delayMs, value })
  return value
}

export function withRepeat<Value>(value: Value, _count?: number, _reverse?: boolean) {
  return value
}

export function withSequence<Value>(...values: Value[]) {
  return values[values.length - 1] as Value
}

export const reanimatedTestState = { reducedMotion: false }

export function useReducedMotion() {
  return reanimatedTestState.reducedMotion
}

export function interpolate(
  _value: number,
  _inputRange: number[],
  outputRange: number[],
): number {
  return outputRange[0] ?? 0
}

export function cancelAnimation(_sharedValue: unknown) {}

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

interface ChainableEntering {
  duration: (ms: number) => ChainableEntering
  delay: (ms: number) => ChainableEntering
  springify: () => ChainableEntering
  easing: (easing: unknown) => ChainableEntering
  reduceMotion: (mode: unknown) => ChainableEntering
}

function makeChainableEntering(): ChainableEntering {
  const chain: ChainableEntering = {
    duration: () => chain,
    delay: () => chain,
    springify: () => chain,
    easing: () => chain,
    reduceMotion: () => chain,
  }
  return chain
}

export const FadeInDown = makeChainableEntering()
export const FadeIn = makeChainableEntering()
export const FadeInUp = makeChainableEntering()
export const FadeInLeft = makeChainableEntering()
export const FadeInRight = makeChainableEntering()
export const FadeOut = makeChainableEntering()
export const ZoomIn = makeChainableEntering()
export const LinearTransition = makeChainableEntering()

export class Keyframe {
  readonly definitions: Record<number, Record<string, unknown>>
  durationMs?: number
  delayMs?: number

  constructor(definitions: Record<number, Record<string, unknown>>) {
    this.definitions = definitions
  }

  duration(durationMs: number): this {
    this.durationMs = durationMs
    return this
  }
  delay(delayMs: number): this {
    this.delayMs = delayMs
    return this
  }
  reduceMotion(): this {
    return this
  }
}

export function runOnJS<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
) {
  return (...args: Args) => callback(...args)
}

export function createAnimatedComponent<Component>(component: Component): Component {
  return component
}

/** Providers renders <ReducedMotionConfig> to pin motion for capture builds. */
export function ReducedMotionConfig(_props: { mode: string }) {
  return null
}

export default Reanimated
