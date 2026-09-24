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
  // react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the menu transform/opacity on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
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
  isClosing: boolean
  openRevision: number
  anchorRect: MenuAnchorRect | null
  open: () => void
  close: () => void
  finishClose: () => void
  toggle: () => void
}

export function useAnchoredMenu(): AnchoredMenuController {
  const anchorRef = useRef<View>(null)
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
  const [openRevision, setOpenRevision] = useState(0)
  const [anchorRect, setAnchorRect] = useState<MenuAnchorRect | null>(null)

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorRect({ x, y, width, height })
    })
  }, [])

  const open = useCallback(() => {
    setPhase('open')
    setOpenRevision((revision) => revision + 1)
    measureAnchor()
  }, [measureAnchor])

  const close = useCallback(() => {
    setPhase((current) => current === 'open' ? 'closing' : current)
  }, [])

  const finishClose = useCallback(() => {
    setPhase((current) => current === 'closing' ? 'closed' : current)
  }, [])

  const toggle = useCallback(() => {
    if (phase === 'open') {
      close()
      return
    }
    open()
  }, [close, open, phase])

  return {
    anchorRef, visible: phase === 'open', isClosing: phase === 'closing',
    openRevision, anchorRect, open, close, finishClose, toggle,
  }
}

interface MenuAnchorHostProps {
  anchorRef: RefObject<View | null>
  children: ReactNode
}

/**
 * Host wrapper for a menu trigger. Renders a non-collapsible View so the anchor
 * ref resolves to a real native view (a flattened view can make measurement
 * no-op on Android). Its 44dp floor keeps the host from clipping any point in
 * the trigger's own minimum touch box during Android's ancestor hit-test walk.
 */
export function MenuAnchorHost({
  anchorRef,
  children,
}: Readonly<MenuAnchorHostProps>) {
  return (
    <View
      ref={anchorRef}
      collapsable={false}
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {children}
    </View>
  )
}

interface AnchoredMenuProps {
  visible: boolean
  isClosing: boolean
  openRevision: number
  anchorRect: MenuAnchorRect | null
  onClose: () => void
  onCloseComplete: () => void
  children: ReactNode
  width?: number
  estimatedHeight?: number
  panelStyle?: StyleProp<ViewStyle>
}

export function AnchoredMenu({
  visible,
  isClosing,
  openRevision,
  anchorRect,
  onClose,
  onCloseComplete,
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
  const progress = useMemo(() => new Animated.Value(0), [])
  const closeToken = useRef(0)

  // react-doctor-disable-next-line advanced-event-handler-refs -- onClose is a stable menu-close callback; the listener re-subscribes only if the trigger passes a new handler and must track `visible` to add/remove, so the re-subscribe is a cheap one-shot rotation dismiss https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  useEffect(() => {
    if (!visible) return

    // react-doctor-disable-next-line rn-no-dimensions-get -- Dimensions.addEventListener returns a subscription with .remove() (the current RN API); used to dismiss the menu on rotation/resize https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    const subscription = Dimensions.addEventListener('change', onClose)
    return () => {
      subscription.remove()
    }
  }, [onClose, visible])

  useEffect(() => {
    if (visible) {
      closeToken.current += 1
      Animated.timing(progress, {
        toValue: 1,
        duration: menuMotion.enterDuration,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start()
      return
    }

    if (!isClosing) return
    const token = ++closeToken.current

    Animated.timing(progress, {
      toValue: 0,
      duration: menuMotion.exitDuration,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && closeToken.current === token) {
        onCloseComplete()
      }
    })
  }, [isClosing, menuMotion.enterDuration, menuMotion.exitDuration, onCloseComplete, progress, visible])

  const position = useMemo(() => {
    // react-doctor-disable-next-line rn-no-dimensions-get -- the menu dismisses on any dimension change (see the close effect above), so this open-time window snapshot never goes stale https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    const window = Dimensions.get('window')
    return getAnchoredMenuPosition({
      anchorRect: anchorRect ?? getFallbackAnchorRect(window.width),
      viewportWidth: window.width,
      viewportHeight: window.height,
      menuWidth: width,
      menuHeight,
    })
  }, [anchorRect, menuHeight, width])

  if (!visible && !isClosing) {
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
      key={openRevision}
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
        <Pressable
          style={styles.backdropPressTarget}
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
