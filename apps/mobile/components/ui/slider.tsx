import * as Primitive from '@rn-primitives/slider'
import { useCallback, useState } from 'react'
import { findNodeHandle, View, type GestureResponderEvent, type NativeSyntheticEvent } from 'react-native'
import type { SliderProps } from '@orbit/shared/contracts/forms'
import { questionSliderTick, questionSliderValue, questionSliderValueAtTick } from '@orbit/shared/types/question-block'
import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function Slider({ label, value, valueText, min, max, step, disabled, onChange }: Readonly<SliderProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [width, setWidth] = useState(0)
  const [focused, setFocused] = useState(false)
  const [nativeHandle, setNativeHandle] = useState<number | undefined>(undefined)
  const trackRef = useCallback((element: View | null) => {
    if (element) { const handle = findNodeHandle(element); if (handle !== null) setNativeHandle(handle) }
  }, [])
  const tickCount = questionSliderTick(max, min, step)
  const tick = questionSliderTick(value ?? min, min, step)
  const fraction = tick / tickCount
  const select = (next: number) => { if (!disabled) onChange(questionSliderValueAtTick(min, step, next)) }
  const touch = (event: GestureResponderEvent) => {
    if (width > TOUCH_TARGET_MIN && !disabled) onChange(questionSliderValue(min, max, step, (event.nativeEvent.locationX - TOUCH_TARGET_MIN / 2) / (width - TOUCH_TARGET_MIN)))
  }
  const focusTargets = { nextFocusLeft: nativeHandle, nextFocusRight: nativeHandle, nextFocusUp: nativeHandle, nextFocusDown: nativeHandle }
  const keys = { onKeyDown: (event: NativeSyntheticEvent<{ key: string }>) => {
    const key = event.nativeEvent.key
    if (key === 'ArrowRight' || key === 'ArrowUp') select(Math.min(tickCount, tick + 1))
    else if (key === 'ArrowLeft' || key === 'ArrowDown') select(Math.max(0, tick - 1))
    else if (key === 'Enter' || key === ' ') select(tick)
  } }
  return <Primitive.Root value={tick} min={0} max={tickCount} step={1} disabled={disabled} onValueChange={values => select(values[0]!)}>
    <Primitive.Track {...keys} ref={trackRef} {...focusTargets} accessibilityLabel={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value ?? min} aria-valuetext={valueText} accessibilityValue={{ min, max, now: value ?? min, text: valueText }} focusable={!disabled}
      onLayout={event => setWidth(event.nativeEvent.layout.width)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderGrant={touch} onResponderMove={touch}
      style={{ minHeight: TOUCH_TARGET_MIN, justifyContent: 'center', paddingHorizontal: 24, borderRadius: radius.full, opacity: disabled ? 0.6 : 1, outlineWidth: focused && !disabled ? 2 : 0, outlineOffset: -2, outlineColor: tokens.primary, outlineStyle: 'solid' }}>
      <View pointerEvents="none" style={{ height: 4, borderRadius: radius.full, backgroundColor: tokens.fg3 }}>
        <Primitive.Range style={{ width: `${fraction * 100}%`, height: 4, borderRadius: radius.full, backgroundColor: tokens.primary }} />
        <Primitive.Thumb style={{ position: 'absolute', left: `${fraction * 100}%`, width: 24, height: 24, borderRadius: radius.full, backgroundColor: tokens.primary, top: '50%', transform: [{ translateX: -12 }, { translateY: -12 }] }} />
      </View>
    </Primitive.Track>
  </Primitive.Root>
}
