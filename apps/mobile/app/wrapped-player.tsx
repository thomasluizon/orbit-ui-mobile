import { useMemo } from 'react'
import { Pressable, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { FadeInDown, ReduceMotion, runOnJS } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { X } from 'lucide-react-native'
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

  if (!current) return null

  return (
    <GestureDetector gesture={swipeDown}>
      <View style={[styles.player, { backgroundColor: tokens.bg }]}>
        <LinearGradient
          colors={[`rgba(${tokens.primaryRgb}, 0.32)`, `rgba(${tokens.primaryRgb}, 0.1)`, `rgba(${tokens.primaryRgb}, 0)`]}
          locations={[0, 0.4, 0.72]}
          style={styles.gradientBackdrop}
          pointerEvents="none"
        />

        <View style={styles.headerRow}>
          <View style={styles.progressRow}>
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
            style={({ pressed }) => [styles.closeBtn, pressed ? styles.closeBtnPressed : null]}
          >
            <X size={22} color={tokens.fg1} strokeWidth={1.8} />
          </Pressable>
        </View>

        <Animated.View
          key={current.id}
          entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
          style={styles.player}
        >
          <WrappedSlide
            slide={current}
            recap={recap}
            period={period}
            tokens={tokens}
            displayName={displayName}
          />
        </Animated.View>

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
