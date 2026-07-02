import { useEffect, useMemo } from 'react'
import { BackHandler, Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { ChevronLeft, X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useWrappedStory, type WrappedSlide as WrappedSlideModel } from '@/hooks/use-wrapped'
import { WrappedSlide } from './wrapped-slide'
import { styles, type Tokens } from './wrapped-styles'

interface WrappedPlayerProps {
  slides: WrappedSlideModel[]
  recap: Recap
  period: RecapSharePeriod
  tokens: Tokens
  displayName?: string
  onClose: () => void
}

/** Full-screen tap/swipe-driven Wrapped story: segmented progress, prev/next zones, swipe-down to close, Share CTA last. */
export function WrappedPlayer({
  slides,
  recap,
  period,
  tokens,
  displayName,
  onClose,
}: Readonly<WrappedPlayerProps>) {
  const { t } = useTranslation()
  const { index, isFirst, isLast, next, prev } = useWrappedStory(slides.length)
  const current = slides[index]

  const swipeDown = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(20)
        .failOffsetY(-20)
        .onEnd((event) => {
          'worklet'
          if (event.translationY > 120) {
            runOnJS(onClose)()
          }
        }),
    [onClose],
  )

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => subscription.remove()
  }, [onClose])

  if (!current) return null

  return (
    <GestureDetector gesture={swipeDown}>
      <View style={[styles.player, { backgroundColor: tokens.bg }]}>
        <Svg style={styles.gradientBackdrop} width="100%" height="100%" pointerEvents="none">
          <Defs>
            <RadialGradient id="wrappedWash" cx="50%" cy="0%" rx="135%" ry="100%">
              <Stop offset="0" stopColor={`rgb(${tokens.primaryRgb})`} stopOpacity={0.32} />
              <Stop offset="0.4" stopColor={`rgb(${tokens.primaryRgb})`} stopOpacity={0.1} />
              <Stop offset="0.72" stopColor={`rgb(${tokens.primaryRgb})`} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#wrappedWash)" />
        </Svg>

        <View style={styles.headerRow}>
          {isLast ? (
            <Pressable
              onPress={prev}
              accessibilityRole="button"
              accessibilityLabel={t('wrapped.previous')}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
            >
              <ChevronLeft size={22} color={tokens.fg1} strokeWidth={1.8} />
            </Pressable>
          ) : null}
          <View
            style={styles.progressRow}
            accessible
            accessibilityLabel={t('wrapped.progressLabel', {
              current: index + 1,
              total: slides.length,
            })}
          >
            {slides.map((slide, slideIndex) => (
              <View
                key={slide.id}
                style={[
                  styles.progressSegment,
                  {
                    backgroundColor: slideIndex <= index ? tokens.primary : tokens.bgElev2,
                    opacity: slideIndex <= index ? 1 : 0.6,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('wrapped.close')}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
          >
            <X size={22} color={tokens.fg1} strokeWidth={1.8} />
          </Pressable>
        </View>

        <View key={current.id} style={styles.player}>
          <WrappedSlide
            slide={current}
            recap={recap}
            period={period}
            tokens={tokens}
            displayName={displayName}
          />
        </View>

        {!isLast ? (
          <View style={styles.tapZones} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('wrapped.previous')}
              disabled={isFirst}
              onPress={prev}
              style={styles.prevZone}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('wrapped.next')}
              onPress={next}
              style={styles.nextZone}
            />
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
}
