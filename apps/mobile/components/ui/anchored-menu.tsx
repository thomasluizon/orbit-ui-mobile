import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  getAnchoredMenuPosition,
  type MenuAnchorRect,
} from '@/lib/anchored-menu'
import { radius } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

interface AnchoredMenuProps {
  visible: boolean
  anchorRect: MenuAnchorRect | null
  onClose: () => void
  children: ReactNode
  width?: number
  estimatedHeight?: number
  panelStyle?: StyleProp<ViewStyle>
}

export function AnchoredMenu({
  visible,
  anchorRect,
  onClose,
  children,
  width = 200,
  estimatedHeight = 220,
  panelStyle,
}: Readonly<AnchoredMenuProps>) {
  const { colors, shadows } = useAppTheme()
  const menuMotion = useResolvedMotionPreset('menu')
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])
  const [menuHeight, setMenuHeight] = useState(estimatedHeight)
  const [shouldRender, setShouldRender] = useState(visible)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setMenuHeight(estimatedHeight)
    }
  }, [estimatedHeight, visible])

  useEffect(() => {
    if (!visible) return

    const subscription = Dimensions.addEventListener('change', onClose)
    return () => {
      subscription.remove()
    }
  }, [onClose, visible])

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      Animated.timing(progress, {
        toValue: 1,
        duration: menuMotion.enterDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: menuMotion.exitDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShouldRender(false)
      }
    })
  }, [menuMotion.enterDuration, menuMotion.exitDuration, progress, visible])

  const position = useMemo(() => {
    if (!anchorRect) return null

    const window = Dimensions.get('window')
    return getAnchoredMenuPosition({
      anchorRect,
      viewportWidth: window.width,
      viewportHeight: window.height,
      menuWidth: width,
      menuHeight,
    })
  }, [anchorRect, menuHeight, width])

  if (!shouldRender || !anchorRect || !position) {
    return null
  }

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [menuMotion.scaleFrom, menuMotion.scaleTo],
  })
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [position.opensUp ? menuMotion.shift * 0.4 : -menuMotion.shift * 0.4, 0],
  })

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <TouchableOpacity
          style={styles.backdropPressTarget}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.panel,
            panelStyle,
            {
              width,
              left: position.left,
              top: position.top,
              opacity: progress,
              transform: [{ translateY }, { scale }],
            },
          ]}
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height
            if (Math.abs(nextHeight - menuHeight) > 1) {
              setMenuHeight(nextHeight)
            }
          }}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.08)',
    },
    backdropPressTarget: {
      ...StyleSheet.absoluteFillObject,
    },
    panel: {
      position: 'absolute',
      minWidth: 176,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      backgroundColor: colors.surfaceOverlay,
      padding: 6,
      ...shadows.lg,
      elevation: 16,
    },
  })
}
