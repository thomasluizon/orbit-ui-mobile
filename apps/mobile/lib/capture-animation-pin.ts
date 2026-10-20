import { Animated } from 'react-native'

interface Animation {
  start: (callback?: (result: { finished: boolean }) => void) => void
  stop: () => void
}

interface AnimationConfiguration {
  delay?: number
  duration?: number
  toValue: unknown
  useNativeDriver: boolean
  [key: string]: unknown
}

export interface CaptureAnimatedDriver {
  loop: (animation: Animation, configuration?: object) => Animation
  parallel: (animations: Animation[]) => Animation
  spring: (value: unknown, configuration: AnimationConfiguration) => Animation
  stagger: (delay: number, animations: Animation[]) => Animation
  timing: (value: unknown, configuration: AnimationConfiguration) => Animation
}

const pinnedDrivers = new WeakSet<object>()
let nativeAnimationsPinned = false

function pinNativeAnimationDurations(): void {
  if (nativeAnimationsPinned) return
  nativeAnimationsPinned = true

  const timing = Animated.timing.bind(Animated)
  const pinnedTiming: typeof Animated.timing = (value, configuration) =>
    timing(value, { ...configuration, delay: 0, duration: 0 })
  const pinnedSpring: typeof Animated.spring = (value, configuration) =>
    timing(
      value,
      { ...configuration, delay: 0, duration: 0 } as Animated.TimingAnimationConfig,
    )
  const pinnedLoop: typeof Animated.loop = (animation) => animation
  const pinnedStagger: typeof Animated.stagger = (_delay, animations) =>
    Animated.parallel(animations)
  Object.assign(Animated, {
    loop: pinnedLoop,
    spring: pinnedSpring,
    stagger: pinnedStagger,
    timing: pinnedTiming,
  })
}

export function pinCaptureAnimationDurations(
  driver?: CaptureAnimatedDriver,
): void {
  if (!driver) {
    pinNativeAnimationDurations()
    return
  }
  if (pinnedDrivers.has(driver)) return
  pinnedDrivers.add(driver)

  const timing = driver.timing.bind(driver)
  driver.timing = (value, configuration) =>
    timing(value, { ...configuration, delay: 0, duration: 0 })
  driver.spring = (value, configuration) =>
    timing(value, { ...configuration, delay: 0, duration: 0 })
  driver.loop = (animation) => animation
  driver.stagger = (_delay, animations) => driver.parallel(animations)
}
