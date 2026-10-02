import { ActionRow } from './action-row'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { SHEET_BODY_INSETS, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from '@/components/ui/icons'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'
import { AppToast } from '@/components/ui/app-toast'

const MAX_HEIGHT_RATIO = 0.85
const SCROLL_EDGE_PEEK = 24
// WHY: TrueSheet 3.11.3 exposes only `dimmed` and hardcodes Android dim opacity to 0.50. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/android/src/main/java/com/lodev09/truesheet/core/TrueSheetDimView.kt#L38
const TRUE_SHEET_DIMMED = true

export interface SheetHandle {
  /**
   * Dismisses the native sheet and runs `exitAction` once the dismissal
   * completes. Without an `exitAction` the sheet's own `onClose` runs instead.
   * `onRejected` runs instead of either when the native dismissal rejects.
   */
  requestClose: (exitAction?: () => void, onRejected?: () => void) => void
}

/**
 * The one close path a sheet host may use. Direct navigation from a presented TrueSheet requires the react-native-screens patch (https://sheet.lodev09.com/guides/navigation).
 * This app ships without it, so dismiss before navigating and never flip the open state directly.
 * The all-Modals claim was an inference: `main`'s `anchored-menu.tsx`, absent from this branch, raced render-phase `setState` with queued async `setState` at mount (thomasluizon/orbit-tickets#134; fixed in thomasluizon/orbit-ui-mobile#1041).
 * Apply D136: "Reproduce a device bug on the exact shipped build before calling it fixed."
 */
export function useSheetHost() {
  const sheetRef = useRef<SheetHandle>(null)

  const closeSheet = useCallback((exitAction?: () => void, onRejected?: () => void) => {
    const handle = sheetRef.current
    if (handle) handle.requestClose(exitAction, onRejected)
    else exitAction?.()
  }, [])

  return { sheetRef, closeSheet }
}

interface MobileSheetProps extends SheetProps {
  /** The handle `useSheetHost` fills in, so the host can close through the native dismissal. */
  ref?: Ref<SheetHandle>
  /** Lets a child FlatList own scrolling, so large picker collections stay virtualized. */
  virtualizedBody?: boolean
}

/** The native overlay surface. Callers mount it only while it is open. */
export function Sheet({
  title,
  accessibleTitle,
  headerAccessory,
  actions,
  minimumBodyWidth,
  boundedBody = false,
  onClose,
  onAttemptDismiss,
  virtualizedBody = false,
  children,
  ref,
}: Readonly<MobileSheetProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { height, width } = useWindowDimensions()
  const bodyPaddingHorizontal = minimumBodyWidth == null
    ? 24
    : SHEET_BODY_INSETS.reduce<number>((inset, step) => (
      minimumBodyWidth + step * 2 <= Math.min(width, SHELL_CONTENT_MAX_WIDTH) ? step : inset
    ), SHEET_BODY_INSETS[0])
  const bodyStyle = [styles.body, { paddingHorizontal: bodyPaddingHorizontal }]
  const { bottom: bottomInset } = useSafeAreaInsets()
  const [headerHeight, setHeaderHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const { t } = useTranslation()
  const overlayId = useId()
  const sheetId = `sheet:${overlayId}`
  const registerOpenOverlay = useUIStore((state) => state.registerOpenOverlay)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const topOverlayId = useUIStore((state) => state.openOverlayIds.at(-1))
  const currentToast = useAppToastStore((state) => state.currentToast)
  const sheetRef = useRef<TrueSheet>(null)
  const exitActionRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const handleDidDismiss = useCallback(() => {
    unregisterOpenOverlay(sheetId)
    const exitAction = exitActionRef.current
    exitActionRef.current = null
    if (exitAction) {
      exitAction()
      return
    }
    onCloseRef.current?.()
  }, [sheetId, unregisterOpenOverlay])

  useEffect(() => {
    registerOpenOverlay(sheetId)
    return () => unregisterOpenOverlay(sheetId)
  }, [sheetId, registerOpenOverlay, unregisterOpenOverlay])

  useEffect(() => {
    void sheetRef.current?.present().catch(() => {
      // WHY: A rejected presentation leaves no native sheet to keep mounted. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/src/TrueSheet.tsx#L374-L394
      handleDidDismiss()
    })
  }, [handleDidDismiss])

  const requestClose = useCallback((exitAction?: () => void, onRejected?: () => void) => {
    exitActionRef.current = exitAction ?? null
    void sheetRef.current?.dismiss().catch(() => {
      // WHY: A rejected dismissal leaves the native sheet visible. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/src/TrueSheet.tsx#L404-L410
      exitActionRef.current = null
      onRejected?.()
    })
  }, [])

  const handle = useMemo<SheetHandle>(() => ({ requestClose }), [requestClose])

  useImperativeHandle(ref, () => handle, [handle])

  const handleBlockedBackPress = useCallback(() => {
    onAttemptDismiss?.()
    return true
  }, [onAttemptDismiss])

  const header = title || accessibleTitle || headerAccessory || onClose || onAttemptDismiss ? (
    <View style={styles.header} accessibilityLabel={accessibleTitle} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
      {title ? <Text numberOfLines={1} style={styles.title}>{title}</Text> : (
        <View accessible={Boolean(accessibleTitle)} accessibilityLabel={accessibleTitle} style={styles.titleSpacer} />
      )}
      {headerAccessory}
      {onClose || onAttemptDismiss ? (
        <Pressable
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
          onPress={() => {
            if (onClose) requestClose()
            else onAttemptDismiss?.()
          }}
          style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
        >
          <X color={tokens.fg2} size={24} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </View>
  ) : undefined

  const showSheetToast = topOverlayId === sheetId && currentToast !== null
  const footer = renderSheetFooter(actions, showSheetToast, sheetId, styles, bottomInset, setFooterHeight)
  // WHY: TrueSheet 3.11.3 adds the bottom inset to every detent and pins the footer to the sheet bottom, so the footer covers the body only above that inset. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/android/src/main/java/com/lodev09/truesheet/core/TrueSheetDetentCalculator.kt#L42-L55
  const reservedFooterHeight = footer ? Math.max(0, footerHeight - bottomInset) : 0
  const maxBodyHeight = Math.max(0, height * MAX_HEIGHT_RATIO - SCROLL_EDGE_PEEK - headerHeight - bottomInset)

  return (
    <TrueSheet
      ref={sheetRef}
      backgroundColor={tokens.bgSheet}
      cornerRadius={28}
      // WHY: TrueSheet 3.11.3 sizes the sheet to its last detent and lets a drag reach it, so a second detent opens a blank area under short content, while `maxContentHeight` already caps long content. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/android/src/main/java/com/lodev09/truesheet/TrueSheetViewController.kt#L847-L873
      detents={['auto']}
      dimmed={TRUE_SHEET_DIMMED}
      dismissible={onClose != null}
      footer={footer}
      grabber
      grabberOptions={{
        adaptive: false,
        color: tokens.hairlineStrong,
        height: 4,
        topMargin: 12,
        width: 48,
      }}
      header={header}
      maxContentHeight={height * MAX_HEIGHT_RATIO - SCROLL_EDGE_PEEK}
      maxContentWidth={SHELL_CONTENT_MAX_WIDTH}
      anchor="center"
      insetAdjustment="automatic"
      onBackPress={onClose ? undefined : handleBlockedBackPress}
      onDidDismiss={handleDidDismiss}
      scrollable={false}
    >
      {virtualizedBody ? (
        <View testID="sheet-virtualized-body" style={[bodyStyle, { maxHeight: maxBodyHeight }]}>
          {children}
          <View testID="sheet-footer-space" style={{ height: reservedFooterHeight }} />
        </View>
      ) : (
        <KeyboardAwareSheetScrollView
          testID="sheet-body-scroll"
          style={{ maxHeight: maxBodyHeight }}
          contentContainerStyle={[bodyStyle, boundedBody ? { maxHeight: maxBodyHeight } : null]}
          keyboardVerticalOffset={footer ? footerHeight : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
          <View testID="sheet-footer-space" style={{ height: reservedFooterHeight }} />
        </KeyboardAwareSheetScrollView>
      )}
    </TrueSheet>
  )
}

type Tokens = ReturnType<typeof createTokensV2>

function renderSheetFooter(
  actions: ReactNode,
  showSheetToast: boolean,
  sheetId: string,
  styles: ReturnType<typeof createStyles>,
  bottomInset: number,
  setFooterHeight: (height: number) => void,
) {
  if (!actions && !showSheetToast) return undefined
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset }]} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      {showSheetToast ? <View style={styles.notice}><AppToast placement="sheet" sheetId={sheetId} /></View> : null}
      {actions ? <View style={styles.actions}><ActionRow>{actions}</ActionRow></View> : null}
    </View>
  )
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      minHeight: 56,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 8,
    },
    title: {
      color: tokens.fg1,
      flex: 1,
      fontFamily: 'Geist_500Medium',
      fontSize: 22,
    },
    titleSpacer: {
      flex: 1,
    },
    close: {
      alignItems: 'center',
      borderRadius: 999,
      overflow: 'hidden',
      minHeight: 48,
      justifyContent: 'center',
      width: 48,
    },
    pressed: {
      backgroundColor: tokens.bgHover,
    },
    body: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 24,
    },
    actions: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-end',
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 24,
    },
    footer: { backgroundColor: tokens.bgSheet },
    notice: { paddingHorizontal: 24, paddingVertical: 16 },
  })
}
