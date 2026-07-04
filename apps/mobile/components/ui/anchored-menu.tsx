import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  getAnchoredMenuPosition,
  getFallbackAnchorRect,
  type MenuAnchorRect,
} from '@/lib/anchored-menu'
import { createTokensV2, easings, radius, shadowsV2 } from '@/lib/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

/**
 * Single seam for an anchored (popover) menu: owns the trigger ref, open/close
 * state and the measured anchor rect. `open`/`toggle` flip visibility
 * synchronously and then refine the anchor position, so the menu never depends
 * on a native measure callback firing (which silently no-ops on Android Fabric
 * release builds). Pair with `MenuAnchorHost` on the trigger and `AnchoredMenu`
 * for the panel.
 */
export interface AnchoredMenuController {
  anchorRef: RefObject<View | null>
  visible: boolean
  anchorRect: MenuAnchorRect | null
  open: () => void
  close: () => void
  toggle: () => void
}

export function useAnchoredMenu(): AnchoredMenuController {
  const anchorRef = useRef<View>(null)
  const [visible, setVisible] = useState(false)
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(null)

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorRect({ x, y, width, height })
    })
  }, [])

  const open = useCallback(() => {
    setVisible(true)
    measureAnchor()
  }, [measureAnchor])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const toggle = useCallback(() => {
    if (visible) {
      setVisible(false)
      return
    }
    setVisible(true)
    measureAnchor()
  }, [measureAnchor, visible])

  return { anchorRef, visible, anchorRect, open, close, toggle }
}

interface MenuAnchorHostProps {
  anchorRef: RefObject<View | null>
  children: ReactNode
}

/**
 * Host wrapper for a menu trigger. Renders a non-collapsible View so the anchor
 * ref resolves to a real native view (a flattened view can make measurement
 * no-op on Android), keeping the measure/open invariant in one place.
 */
export function MenuAnchorHost({
  anchorRef,
  children,
}: Readonly<MenuAnchorHostProps>) {
  return (
    <View ref={anchorRef} collapsable={false}>
      {children}
    </View>
  )
}

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
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const menuMotion = useResolvedMotionPreset('menu')
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [menuHeight, setMenuHeight] = useState(estimatedHeight)
  const [shouldRender, setShouldRender] = useState(visible)
  const progress = useMemo(() => new Animated.Value(0), [])

  const [prevVisible, setPrevVisible] = useState(visible)
  const [prevEstimatedHeight, setPrevEstimatedHeight] = useState(estimatedHeight)
  if (visible !== prevVisible || estimatedHeight !== prevEstimatedHeight) {
    setPrevVisible(visible)
    setPrevEstimatedHeight(estimatedHeight)
    if (visible) {
      setMenuHeight(estimatedHeight)
      if (visible !== prevVisible) setShouldRender(true)
    }
  }

  useEffect(() => {
    if (!visible) return

    const subscription = Dimensions.addEventListener('change', onClose)
    return () => {
      subscription.remove()
    }
  }, [onClose, visible])

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, {
        toValue: 1,
        duration: menuMotion.enterDuration,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: menuMotion.exitDuration,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShouldRender(false)
      }
    })
  }, [menuMotion.enterDuration, menuMotion.exitDuration, progress, visible])

  const position = useMemo(() => {
    const window = Dimensions.get('window')
    return getAnchoredMenuPosition({
      anchorRect: anchorRect ?? getFallbackAnchorRect(window.width),
      viewportWidth: window.width,
      viewportHeight: window.height,
      menuWidth: width,
      menuHeight,
    })
  }, [anchorRect, menuHeight, width])

  if (!shouldRender) {
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
          importantForAccessibility="no"
          accessibilityElementsHidden
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

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.16)',
    },
    backdropPressTarget: {
      ...StyleSheet.absoluteFill,
    },
    panel: {
      position: 'absolute',
      minWidth: 176,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgSheet,
      padding: 6,
      ...shadowsV2.shadow2,
    },
  })
}
