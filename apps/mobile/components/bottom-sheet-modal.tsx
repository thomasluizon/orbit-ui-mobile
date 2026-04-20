import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, BackHandler } from 'react-native'
import {
  BottomSheetBackdrop,
  BottomSheetModal as GorhomBottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet'
import { ReduceMotion } from 'react-native-reanimated'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ThemeContextValue } from '@/lib/theme-provider'
import {
  createBottomSheetOverlayState,
  requestBottomSheetClose,
  syncBottomSheetOverlayRegistration,
  teardownBottomSheetOverlay,
} from '@/lib/bottom-sheet-overlay-controller'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { isTopOverlay, registerOverlay, unregisterOverlay } from '@/lib/overlay-stack'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BottomSheetModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Change this value to force re-present when `open` stays true (e.g. switching content). */
  contentKey?: string
  snapPoints?: (string | number)[]
  formMode?: boolean
  canDismiss?: boolean
  isDirty?: boolean
  onAttemptDismiss?: (reason: 'backdrop' | 'close-button' | 'navigation' | 'system-back') => void
  children: ReactNode
}

// ---------------------------------------------------------------------------
// BottomSheetModal -- wrapper around @gorhom/bottom-sheet
// ---------------------------------------------------------------------------

export function BottomSheetModal({
  open,
  onClose,
  title,
  contentKey,
  snapPoints: snapPointsProp,
  formMode = false,
  canDismiss = true,
  isDirty = false,
  onAttemptDismiss,
  children,
}: BottomSheetModalProps) {
  const { colors } = useAppTheme()
  const prefersReducedMotion = usePrefersReducedMotion()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(colors), [colors])
  const bottomSheetRef = useRef<GorhomBottomSheetModal>(null)
  const isOpenRef = useRef(open)
  const overlayStateRef = useRef(createBottomSheetOverlayState())
  const overlayIdRef = useRef(`sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [isPresented, setIsPresented] = useState(false)

  const snapPointsKey = (snapPointsProp ?? ['50%', '80%']).join('|')
  const snapPoints = useMemo(
    () => snapPointsProp ?? ['50%', '80%'],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapPointsKey],
  )

  const requestClose = useCallback(
    (reason: 'backdrop' | 'close-button' | 'navigation' | 'system-back') => {
      return requestBottomSheetClose(overlayStateRef.current, {
        canDismiss,
        dismissSheet: () => {
          bottomSheetRef.current?.dismiss()
        },
        isDirty,
        onAttemptDismiss,
        reason,
      })
    },
    [canDismiss, isDirty, onAttemptDismiss],
  )

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        pressBehavior={canDismiss && !isDirty ? 'close' : 'none'}
        onPress={() => {
          if (isTopOverlay(overlayIdRef.current)) {
            requestClose('backdrop')
          }
        }}
      />
    ),
    [canDismiss, isDirty, requestClose],
  )

  const renderBackground = useCallback(
    ({ style }: BottomSheetBackgroundProps) => (
      <View style={[style, styles.sheetBackground]} />
    ),
    [styles.sheetBackground],
  )

  useEffect(() => {
    isOpenRef.current = open
  }, [open])

  useEffect(() => {
    if (open) {
      bottomSheetRef.current?.present()
    } else {
      bottomSheetRef.current?.dismiss()
    }
  }, [open, contentKey])

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

  const handleChange = useCallback(
    (index: number) => {
      const nextPresented = index >= 0
      setIsPresented(nextPresented)
      syncBottomSheetOverlayRegistration(overlayStateRef.current, {
        isPresented: nextPresented,
        overlayId: overlayIdRef.current,
        register: registerOverlay,
        requestClose,
        unregister: unregisterOverlay,
      })
    },
    [requestClose],
  )

  const handleDismiss = useCallback(() => {
    setIsPresented(false)
    teardownBottomSheetOverlay(overlayStateRef.current, {
      overlayId: overlayIdRef.current,
      unregister: unregisterOverlay,
    })

    if (isOpenRef.current) {
      isOpenRef.current = false
      onClose()
    }
  }, [onClose])

  return (
    <GorhomBottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleChange}
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundComponent={renderBackground}
      enablePanDownToClose={canDismiss && !isDirty}
      enableBlurKeyboardOnGesture={formMode}
      enableContentPanningGesture={!formMode}
      keyboardBehavior={formMode ? 'extend' : 'interactive'}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      bottomInset={insets.bottom}
      animateOnMount={!prefersReducedMotion}
      overrideReduceMotion={prefersReducedMotion ? ReduceMotion.Always : ReduceMotion.Never}
      handleIndicatorStyle={styles.handleIndicator}
    >
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => requestClose('close-button')}
            activeOpacity={0.7}
          >
            <X size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {children}
    </GorhomBottomSheetModal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

type ThemeColors = ThemeContextValue['colors']

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    handleIndicator: {
      backgroundColor: colors.handle,
      width: 36,
      height: 4,
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
      color: colors.textPrimary,
    },
    closeButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetBackground: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderMuted,
      overflow: 'hidden',
    },
  })
}
