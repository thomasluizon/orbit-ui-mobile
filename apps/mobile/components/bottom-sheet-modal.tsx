import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
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
import { nearestSnapHeight, offsetFor, resolveSnapHeights } from '@/lib/bottom-sheet-snap'
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
const DISMISS_DISTANCE = 80
const DISMISS_VELOCITY = 0.6
const RUBBER_BAND_FACTOR = 0.4
const MIN_DRAG_BACKDROP_OPACITY = 0.2

/**
 * Bottom-sheet modal built on React Native's core `Modal` + `Animated` rather
 * than @gorhom/bottom-sheet. gorhom's `present()` relies on a
 * requestAnimationFrame-gated state flip plus a portal teleport, both of which
 * silently no-op on the New Architecture (Fabric/Bridgeless) in release builds.
 * RN's `Modal`/`Animated` are architecture-agnostic, so the sheet opens
 * reliably. The public props mirror the previous gorhom wrapper so callers are
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
  const openOffset = offsetFor(snaps[0], maxHeight)
  const expandedOffset = offsetFor(Math.max(...snaps), maxHeight)

  const overlayStateRef = useRef(createBottomSheetOverlayState())
  // Lazy useState keeps Date.now() / Math.random() out of render (purity rule).
  const [overlayId] = useState(
    () => `sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const overlayIdRef = useRef(overlayId)

  const [visible, setVisible] = useState(open)
  const [isPresented, setIsPresented] = useState(false)
  const isOpenRef = useRef(open)

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  // Captured on gesture grant; read only inside handlers, never during render.
  const dragBaseOffsetRef = useRef(openOffset)

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
    isOpenRef.current = open
    translateY.stopAnimation()
    backdropOpacity.stopAnimation()

    if (open) {
      setVisible(true)
      const duration = prefersReducedMotion ? 0 : 300
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: openOffset,
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
      const duration = prefersReducedMotion ? 0 : 240
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
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
  }, [open, contentKey, prefersReducedMotion, openOffset, translateY, backdropOpacity])

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

  const settleToOffset = useCallback(
    (offset: number) => {
      backdropOpacity.setValue(1)
      if (prefersReducedMotion) {
        translateY.setValue(offset)
        return
      }
      Animated.spring(translateY, {
        toValue: offset,
        useNativeDriver: true,
        ...getSpringConfig('sheet', prefersReducedMotion),
      }).start()
    },
    [backdropOpacity, prefersReducedMotion, translateY],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > DRAG_ACTIVATION_DISTANCE &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((value: number) => {
            dragBaseOffsetRef.current = value
          })
        },
        onPanResponderMove: (_event, gesture) => {
          const nextOffset = clampDragOffset(
            dragBaseOffsetRef.current + gesture.dy,
            expandedOffset,
          )
          translateY.setValue(nextOffset)
          backdropOpacity.setValue(backdropOpacityForOffset(nextOffset, openOffset, snaps[0]))
        },
        onPanResponderRelease: (_event, gesture) => {
          const releasedOffset = dragBaseOffsetRef.current + gesture.dy
          const draggedPastOpen = releasedOffset - openOffset
          if (draggedPastOpen > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            // Spring back to the opening snap; if the dirty-guard blocks the
            // dismiss this stands, otherwise the close effect takes over.
            settleToOffset(openOffset)
            requestClose('navigation')
            return
          }
          const releasedHeight = maxHeight - releasedOffset
          const targetHeight = nearestSnapHeight(snaps, releasedHeight, gesture.vy)
          settleToOffset(offsetFor(targetHeight, maxHeight))
        },
      }),
    [
      backdropOpacity,
      expandedOffset,
      maxHeight,
      openOffset,
      requestClose,
      settleToOffset,
      snaps,
      translateY,
    ],
  )

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
                height: maxHeight,
                paddingBottom: insets.bottom,
                transform: [{ translateY }],
              },
            ]}
          >
            <View {...panResponder.panHandlers}>
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

            <View style={styles.content}>{children}</View>
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

function clampDragOffset(offset: number, expandedOffset: number): number {
  if (offset >= expandedOffset) return offset
  // Rubber-band when dragging past the tallest snap so it resists, not jumps.
  return expandedOffset - (expandedOffset - offset) * RUBBER_BAND_FACTOR
}

function backdropOpacityForOffset(
  offset: number,
  openOffset: number,
  openHeight: number,
): number {
  if (offset <= openOffset || openHeight <= 0) return 1
  const faded = 1 - (offset - openOffset) / openHeight
  return Math.max(MIN_DRAG_BACKDROP_OPACITY, faded)
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
