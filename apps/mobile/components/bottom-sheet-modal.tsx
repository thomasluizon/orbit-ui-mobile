import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  type GestureResponderEvent,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTokensV2 } from '@/lib/theme'
import {
  createBottomSheetOverlayState,
  requestBottomSheetClose,
  syncBottomSheetOverlayRegistration,
  teardownBottomSheetOverlay,
} from '@/lib/bottom-sheet-overlay-controller'
import { nearestSnapHeight, resolveSnapHeights } from '@/lib/bottom-sheet-snap'
import { getSpringConfig, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { isTopOverlay, registerOverlay, unregisterOverlay } from '@/lib/overlay-stack'

type AppTokens = ReturnType<typeof createTokensV2>
type DismissReason = 'backdrop' | 'close-button' | 'navigation' | 'system-back'

interface BottomSheetModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Change this value to force re-present when `open` stays true (e.g. switching content). */
  contentKey?: string
  snapPoints?: (string | number)[]
  canDismiss?: boolean
  isDirty?: boolean
  onAttemptDismiss?: (reason: DismissReason) => void
  children: ReactNode
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ['50%', '80%']
const SCREEN_HEIGHT = Dimensions.get('window').height
/** Backdrop strip kept above the sheet so the status bar is never covered. */
const TOP_GAP = 20
const DRAG_ACTIVATION_DISTANCE = 6
/** How far below the smallest snap a release must land to dismiss. */
const DISMISS_DISTANCE = 80
const DISMISS_VELOCITY = 0.6
const RUBBER_BAND_FACTOR = 0.4
const MIN_DRAG_BACKDROP_OPACITY = 0.2
const OPEN_DURATION = 300
const CLOSE_DURATION = 240
/** Tolerance (px) for treating the sheet as "already at its tallest snap". */
const SNAP_EPSILON = 1

/**
 * Bottom-sheet modal built on React Native's core `Modal` + `Animated` rather
 * than @gorhom/bottom-sheet, whose `present()`/portal silently no-op on the New
 * Architecture (Fabric/Bridgeless) in release builds.
 *
 * The sheet animates its real `height` between snap points, so its content area
 * is bounded to the visible height — a `ScrollView` child scrolls and its footer
 * is always reachable — and it slides in/out via `translateY`. Drag the
 * handle/header up to expand, down to collapse, or past the smallest snap to
 * dismiss (honouring the dirty guard). Dragging the body upward also expands the
 * sheet while it can still grow, then hands vertical drags back to the inner
 * scroll once the tallest snap is reached — a real-drawer feel without stealing
 * scroll. `height` is JS-driven (a layout prop); `translateY`/backdrop opacity
 * are native-driven. Public props mirror the previous wrapper so callers are
 * unchanged.
 */
export function BottomSheetModal({
  open,
  onClose,
  title,
  contentKey,
  snapPoints: snapPointsProp,
  canDismiss = true,
  isDirty = false,
  onAttemptDismiss,
  children,
}: BottomSheetModalProps) {
  const { currentScheme, currentTheme, surfaces } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens, surfaces), [tokens, surfaces])
  const insets = useSafeAreaInsets()
  const prefersReducedMotion = usePrefersReducedMotion()

  const maxHeight = Math.max(SCREEN_HEIGHT - insets.top - TOP_GAP, 0)
  // Consumers pass inline arrays; key on the values so the snaps (and the
  // PanResponder that depends on them) stay referentially stable across renders.
  const snapKey = (snapPointsProp ?? DEFAULT_SNAP_POINTS).join(',')
  const snaps = useMemo(
    () => resolveSnapHeights(parseSnapKey(snapKey), SCREEN_HEIGHT, maxHeight),
    [snapKey, maxHeight],
  )
  const minSnap = snaps[0]
  const maxSnap = Math.max(...snaps)

  const overlayStateRef = useRef(createBottomSheetOverlayState())
  // Lazy useState keeps Date.now() / Math.random() out of render (purity rule).
  const [overlayId] = useState(
    () => `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const overlayIdRef = useRef(overlayId)

  const [visible, setVisible] = useState(open)
  const [isPresented, setIsPresented] = useState(false)

  // Sheet height (current snap) is JS-driven; the slide + backdrop are native.
  const sheetHeight = useRef(new Animated.Value(minSnap)).current
  const translateY = useRef(new Animated.Value(minSnap)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  // Last settled height: the close-slide distance and the drag baseline.
  const restingHeightRef = useRef(minSnap)
  const dragBaseHeightRef = useRef(minSnap)

  const requestClose = useCallback(
    (reason: DismissReason) =>
      requestBottomSheetClose(overlayStateRef.current, {
        canDismiss,
        dismissSheet: onClose,
        isDirty,
        onAttemptDismiss,
        reason,
      }),
    [canDismiss, isDirty, onAttemptDismiss, onClose],
  )

  useEffect(() => {
    sheetHeight.stopAnimation()
    translateY.stopAnimation()
    backdropOpacity.stopAnimation()

    if (open) {
      setVisible(true)
      sheetHeight.setValue(minSnap)
      restingHeightRef.current = minSnap
      translateY.setValue(minSnap)
      const duration = prefersReducedMotion ? 0 : OPEN_DURATION
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setIsPresented(true)
      })
    } else {
      const duration = prefersReducedMotion ? 0 : CLOSE_DURATION
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: restingHeightRef.current,
          duration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setVisible(false)
          setIsPresented(false)
        }
      })
    }
  }, [open, contentKey, prefersReducedMotion, minSnap, sheetHeight, translateY, backdropOpacity])

  useEffect(() => {
    syncBottomSheetOverlayRegistration(overlayStateRef.current, {
      isPresented,
      overlayId: overlayIdRef.current,
      register: registerOverlay,
      requestClose,
      unregister: unregisterOverlay,
    })
  }, [isPresented, requestClose])

  useEffect(
    () => () => {
      teardownBottomSheetOverlay(overlayStateRef.current, {
        overlayId: overlayIdRef.current,
        unregister: unregisterOverlay,
      })
    },
    [],
  )

  useEffect(() => {
    if (!isPresented) return

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isTopOverlay(overlayIdRef.current)) return false
      return requestClose('system-back')
    })

    return () => subscription.remove()
  }, [isPresented, requestClose])

  const settleToHeight = useCallback(
    (height: number) => {
      restingHeightRef.current = height
      backdropOpacity.setValue(1)
      if (prefersReducedMotion) {
        sheetHeight.setValue(height)
        translateY.setValue(0)
        return
      }
      const spring = getSpringConfig('sheet', prefersReducedMotion)
      Animated.parallel([
        Animated.spring(sheetHeight, { toValue: height, useNativeDriver: false, ...spring }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...spring }),
      ]).start()
    },
    [backdropOpacity, prefersReducedMotion, sheetHeight, translateY],
  )

  // Two responders share the same drag math: the header/handle controls the sheet
  // outright, while the body claims only an upward drag that can still grow the
  // sheet — so the inner ScrollView keeps its downward scroll and its at-max
  // upward scroll, and the user can drag the body up to expand like a real drawer.
  const { headerPanResponder, contentPanResponder } = useMemo(() => {
    const onGrant = () => {
      sheetHeight.stopAnimation((value: number) => {
        dragBaseHeightRef.current = value
      })
      translateY.stopAnimation()
      backdropOpacity.stopAnimation()
    }
    const onMove = (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const extent = dragBaseHeightRef.current - gesture.dy
      if (extent >= minSnap) {
        // Resize between snaps; rubber-band when pulled past the tallest.
        sheetHeight.setValue(clampExpand(extent, maxSnap))
        translateY.setValue(0)
        backdropOpacity.setValue(1)
      } else {
        // Below the smallest snap: hold height, slide down toward dismissal.
        const slide = minSnap - extent
        sheetHeight.setValue(minSnap)
        translateY.setValue(slide)
        backdropOpacity.setValue(backdropOpacityForSlide(slide, minSnap))
      }
    }
    const onRelease = (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const extent = dragBaseHeightRef.current - gesture.dy
      const draggedPastMin = minSnap - extent
      if (draggedPastMin > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
        // Spring back to the opening snap; if the dirty-guard blocks the
        // dismiss this stands, otherwise the close effect slides it out.
        settleToHeight(minSnap)
        requestClose('navigation')
        return
      }
      settleToHeight(nearestSnapHeight(snaps, Math.max(extent, minSnap), gesture.vy))
    }
    return {
      headerPanResponder: PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => isVerticalDrag(gesture),
        onPanResponderGrant: onGrant,
        onPanResponderMove: onMove,
        onPanResponderRelease: onRelease,
        onPanResponderTerminationRequest: () => false,
      }),
      contentPanResponder: PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          isVerticalDrag(gesture) &&
          gesture.dy < 0 &&
          restingHeightRef.current < maxSnap - SNAP_EPSILON,
        onPanResponderGrant: onGrant,
        onPanResponderMove: onMove,
        onPanResponderRelease: onRelease,
        onPanResponderTerminationRequest: () => false,
      }),
    }
  }, [backdropOpacity, maxSnap, minSnap, requestClose, settleToHeight, snaps, sheetHeight, translateY])

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => requestClose('system-back')}
    >
      <View style={styles.root}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents={isPresented ? 'auto' : 'none'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (canDismiss && !isDirty && isTopOverlay(overlayIdRef.current)) {
                requestClose('backdrop')
              }
            }}
          />
        </Animated.View>

        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              {
                height: sheetHeight,
                paddingBottom: insets.bottom,
                transform: [{ translateY }],
              },
            ]}
          >
            <View {...headerPanResponder.panHandlers}>
              <View
                style={styles.handle}
                accessibilityRole="adjustable"
                accessibilityLabel={title}
              />

              {title ? (
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => requestClose('close-button')}
                    activeOpacity={0.7}
                  >
                    <X size={18} color={tokens.fg3} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <View style={styles.content} {...contentPanResponder.panHandlers}>
              {children}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

function parseSnapKey(snapKey: string): (string | number)[] {
  return snapKey.split(',').map((entry) => {
    const asNumber = Number(entry)
    return entry.length > 0 && !entry.includes('%') && Number.isFinite(asNumber)
      ? asNumber
      : entry
  })
}

function isVerticalDrag(gesture: PanResponderGestureState): boolean {
  return (
    Math.abs(gesture.dy) > DRAG_ACTIVATION_DISTANCE &&
    Math.abs(gesture.dy) > Math.abs(gesture.dx)
  )
}

function clampExpand(height: number, maxSnap: number): number {
  if (height <= maxSnap) return height
  // Rubber-band when dragging past the tallest snap so it resists, not jumps.
  return maxSnap + (height - maxSnap) * RUBBER_BAND_FACTOR
}

function backdropOpacityForSlide(slide: number, openHeight: number): number {
  if (slide <= 0 || openHeight <= 0) return 1
  return Math.max(MIN_DRAG_BACKDROP_OPACITY, 1 - slide / openHeight)
}

function createStyles(tokens: AppTokens, surfaces: ReturnType<typeof useAppTheme>['surfaces']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.62)',
    },
    keyboardView: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: surfaces.overlay.backgroundColor,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: surfaces.overlay.borderColor,
      overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center',
      backgroundColor: tokens.hairlineStrong,
      width: 42,
      height: 4,
      borderRadius: 2,
      marginTop: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: 16,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: tokens.fg1,
    },
    closeButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: surfaces.elevated.backgroundColor,
      borderWidth: 1,
      borderColor: surfaces.elevated.borderColor,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      flex: 1,
    },
  })
}
