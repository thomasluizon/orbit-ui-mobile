import { useRef, type ReactNode } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Swipeable, RectButton } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { Check, MoreVertical } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'

interface SwipeableRowProps {
  children: ReactNode
  enabled?: boolean
  onLog: () => void
  onMenu: () => void
  done?: boolean
}

const COMMIT_THRESHOLD = 80

/**
 * Wraps a habit card row with gesture-handler Swipeable so we can swipe
 * right to log and left to open the actions sheet. Plays selection
 * haptics on threshold crossings and impact haptic on commit.
 */
export function SwipeableRow({
  children,
  enabled = true,
  onLog,
  onMenu,
  done = false,
}: Readonly<SwipeableRowProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()
  const swipeableRef = useRef<Swipeable>(null)
  const hasHapticFired = useRef(false)

  const renderLeftAction = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const opacity = progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.8, 1],
    })
    return (
      <RectButton
        style={[styles.leftAction, { backgroundColor: 'rgba(52,211,153,0.85)' }]}
        onPress={() => {
          swipeableRef.current?.close()
          onLog()
        }}
      >
        <Animated.View style={[styles.actionContent, { opacity }]}>
          <Check size={18} color="#ffffff" strokeWidth={3} />
          <Text style={styles.actionText}>{t('habits.card.logAction')}</Text>
        </Animated.View>
      </RectButton>
    )
  }

  const renderRightAction = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const opacity = progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.8, 1],
    })
    return (
      <RectButton
        style={[styles.rightAction, { backgroundColor: colors.surfaceElevated }]}
        onPress={() => {
          swipeableRef.current?.close()
          onMenu()
        }}
      >
        <Animated.View style={[styles.actionContent, { opacity }]}>
          <MoreVertical size={18} color={colors.textPrimary} />
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>
            {t('habits.card.menuAction')}
          </Text>
        </Animated.View>
      </RectButton>
    )
  }

  if (!enabled) {
    return <>{children}</>
  }

  return (
    <Swipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={COMMIT_THRESHOLD}
      rightThreshold={COMMIT_THRESHOLD}
      renderLeftActions={renderLeftAction}
      renderRightActions={renderRightAction}
      onSwipeableOpen={(direction) => {
        if (hasHapticFired.current) return
        hasHapticFired.current = true
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
        if (direction === 'left') {
          swipeableRef.current?.close()
          onLog()
        } else {
          swipeableRef.current?.close()
          onMenu()
        }
      }}
      onSwipeableClose={() => {
        hasHapticFired.current = false
      }}
      onBegan={() => {
        hasHapticFired.current = false
      }}
      overshootFriction={8}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  leftAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    marginBottom: 8,
    borderRadius: 16,
  },
  rightAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    marginBottom: 8,
    borderRadius: 16,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
})
