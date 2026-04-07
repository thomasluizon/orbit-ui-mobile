const Reanimated = {
  View: 'AnimatedView',
}

export function useSharedValue<Value>(value: Value) {
  return { value }
}

export function useAnimatedStyle<T>(updater: () => T): T {
  return updater()
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

export function runOnJS<Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
) {
  return (...args: Args) => callback(...args)
}

export function createAnimatedComponent<Component>(component: Component): Component {
  return component
}

export default Reanimated
