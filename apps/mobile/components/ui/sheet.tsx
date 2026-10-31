import { PersonalText } from '@/components/ui/personal-text'
import { ActionRow } from './action-row'
import { MotionPressable as Pressable } from '@/components/ui/motion-pressable'
import { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { PADDING, SPACING, SHEET_BODY_INSETS, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { getPrefersReducedMotion, usePrefersReducedMotion } from '@/lib/motion'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { AccessibilityInfo, StyleSheet, Text, View, useWindowDimensions, type ScrollView, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import { useOverlayFocus } from './focus-provenance-view'
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
// WHY: A dimmed backdrop captures outside taps instead of passing them to the underlying form. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/android/src/main/java/com/lodev09/truesheet/core/TrueSheetDimView.kt#L24-L27
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
  initialFocus?: RefObject<View | null>
  onDidPresent?: () => void
  onBackPress?: () => void
  /** The handle `useSheetHost` fills in, so the host can close through the native dismissal. */
  ref?: Ref<SheetHandle>
  /** Lets a child FlatList own scrolling, so large picker collections stay virtualized. */
  virtualizedBody?: boolean
}

/** The native overlay surface. Callers mount it only while it is open. */
export function Sheet({
  title,
  titleMode = 'label',
  accessibleTitle,
  headerAccessory,
  actions,
  minimumBodyWidth,
  boundedBody = false,
  onClose,
  onAttemptDismiss,
  onBackPress,
  virtualizedBody = false,
  initialFocus,
  onDidPresent,
  children,
  ref,
}: Readonly<MobileSheetProps>) {
  const reducedMotion = usePrefersReducedMotion()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  useOverlayFocus(true)
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(tokens, insets.left, insets.right), [tokens, insets.left, insets.right])
  const { height, width } = useWindowDimensions()
  const bodyPaddingHorizontal = minimumBodyWidth == null
    ? PADDING.sheetInline
    : SHEET_BODY_INSETS.reduce<number>((inset, step) => (
      minimumBodyWidth + step * 2 <= Math.min(width, SHELL_CONTENT_MAX_WIDTH) - insets.left - insets.right ? step : inset
    ), SHEET_BODY_INSETS[0])
  const bodyStyle = [styles.body, { paddingHorizontal: bodyPaddingHorizontal, paddingLeft: bodyPaddingHorizontal + insets.left, paddingRight: bodyPaddingHorizontal + insets.right }]
  const bottomInset = insets.bottom
  const { titleClamped, titleExpanded, titleFocused, onTitleFocusChange, onClampedChange, bodyRef, handleBodyScroll, toggleTitle } = useSheetTitleDisclosure(title)
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
  const closeCompletedRef = useRef(false)
  const presentationPendingRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const handleDidDismiss = useCallback(() => {
    if (closeCompletedRef.current) return
    closeCompletedRef.current = true
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
    let active = true
    void getPrefersReducedMotion().then((reduceMotion) => {
      if (!active || closeCompletedRef.current) return
      const presentation = sheetRef.current?.present(0, !reduceMotion)
      if (!presentation) return
      presentationPendingRef.current = true
      return presentation.finally(() => { presentationPendingRef.current = false })
    }).catch(() => {
      // WHY: A rejected presentation leaves no native sheet to keep mounted. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/src/TrueSheet.tsx#L473-L518
      handleDidDismiss()
    })
    return () => { active = false }
  }, [handleDidDismiss])

  const requestClose = useCallback((exitAction?: () => void, onRejected?: () => void) => {
    if (closeCompletedRef.current) return
    exitActionRef.current = exitAction ?? null
    const presentationWasPending = presentationPendingRef.current
    // WHY: Cancelling a lazy presentation resolves dismiss() without onDidDismiss; both completions share one latch. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/src/TrueSheet.tsx#L524-L558
    void sheetRef.current?.dismiss(!reducedMotion).then(() => {
      if (presentationWasPending) handleDidDismiss()
    }, () => {
      // WHY: A rejected dismissal leaves the native sheet visible. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/src/TrueSheet.tsx#L554-L558
      exitActionRef.current = null
      onRejected?.()
    })
  }, [reducedMotion, handleDidDismiss])

  const handle = useMemo<SheetHandle>(() => ({ requestClose }), [requestClose])

  useImperativeHandle(ref, () => handle, [handle])

  const handleDismissAttempt = useCallback(() => {
    if (onBackPress) onBackPress()
    else onAttemptDismiss?.()
  }, [onAttemptDismiss, onBackPress])

  const closeButton = onClose || onAttemptDismiss ? (
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
  ) : null
  const header = renderSheetHeader({ title, titleMode, accessibleTitle, headerAccessory, onClose, onAttemptDismiss,
    styles, titleClamped, titleExpanded, titleFocused, onTitleFocusChange, onClampedChange, t, closeButton, onToggleTitle: toggleTitle,
    onLayout: (event) => setHeaderHeight(event.nativeEvent.layout.height) })
  const expandedTitle = title && titleExpanded && titleMode === 'typed' ? <PersonalText expanded selectable style={styles.fullTitle}>{title}</PersonalText> : null

  const showSheetToast = topOverlayId === sheetId && currentToast !== null
  const footer = renderSheetFooter(actions, showSheetToast, sheetId, styles, setFooterHeight)
  // WHY: Native padding owns the footer inset, so the measured child height needs no inset subtraction. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/common/cpp/react/renderer/components/TrueSheetSpec/TrueSheetFooterViewShadowNode.cpp#L36-L56
  const reservedFooterHeight = footer ? footerHeight : 0
  const maxBodyHeight = Math.max(0, height * MAX_HEIGHT_RATIO - SCROLL_EDGE_PEEK - headerHeight - bottomInset)
  const maxScrollHeight = Math.max(0, maxBodyHeight - reservedFooterHeight)

  return (
    <TrueSheet
      ref={sheetRef}
      backgroundStyle={{ backgroundColor: tokens.bgSheet }}
      cornerRadius={28}
      // WHY: The last detent sets the expanded height, so a second stop would let short content expand into blank space. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/android/src/main/java/com/lodev09/truesheet/TrueSheetViewController.kt#L1095-L1114
      detents={['auto']}
      dimmed={TRUE_SHEET_DIMMED}
      dismissible={onClose != null && onBackPress == null}
      footer={footer}
      footerOptions={{ position: 'absolute' }}
      footerStyle={styles.footer}
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
      placement="center"
      insetAdjustment="automatic"
      onDismissAttempt={handleDismissAttempt}
      onDidDismiss={handleDidDismiss}
      onDidPresent={() => {
        onDidPresent?.()
        const target = initialFocus?.current
        if (!target) return
        target.setNativeProps({ hasTVPreferredFocus: true })
        AccessibilityInfo.sendAccessibilityEvent(target, 'focus')
      }}
    >
      {virtualizedBody ? (
        <View testID="sheet-virtualized-body" style={[bodyStyle, virtualizedBodyStyle(maxBodyHeight, Boolean(footer))]}>
          {expandedTitle}
          {children}
          <View testID="sheet-footer-space" style={{ height: reservedFooterHeight }} />
        </View>
      ) : (
        <>
          <KeyboardAwareSheetScrollView
            ref={bodyRef}
            onScroll={handleBodyScroll}
            testID="sheet-body-scroll"
            style={{ maxHeight: maxScrollHeight }}
            contentContainerStyle={[bodyStyle, boundedBody ? { maxHeight: maxScrollHeight } : null]}
            // WHY: The native footer adds safe-area padding outside the measured child, so focus clearance reserves both heights. https://github.com/lodev09/react-native-true-sheet/blob/v4.0.1/src/TrueSheet.tsx#L706-L720
            keyboardVerticalOffset={footer ? footerHeight + bottomInset : undefined}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {expandedTitle}
            {children}
          </KeyboardAwareSheetScrollView>
          <View testID="sheet-footer-space" style={{ height: reservedFooterHeight }} />
        </>
      )}
    </TrueSheet>
  )
}

type Tokens = ReturnType<typeof createTokensV2>

function renderSheetHeader({ title, titleMode, accessibleTitle, headerAccessory, onClose, onAttemptDismiss,
  styles, titleClamped, titleExpanded, titleFocused, onTitleFocusChange, onClampedChange, t, closeButton, onToggleTitle, onLayout,
}: Pick<SheetProps, 'title' | 'titleMode' | 'accessibleTitle' | 'headerAccessory' | 'onClose' | 'onAttemptDismiss'> & {
  styles: ReturnType<typeof createStyles>
  titleExpanded: boolean
  titleClamped: boolean
  titleFocused: boolean
  onTitleFocusChange: (focused: boolean) => void
  onClampedChange: (clamped: boolean) => void
  t: ReturnType<typeof useTranslation>['t']
  closeButton: ReactNode
  onToggleTitle: () => void
  onLayout: NonNullable<import('react-native').ViewProps['onLayout']>
}) {
  return title || accessibleTitle || headerAccessory || onClose || onAttemptDismiss ? (
    <View style={styles.header} accessibilityLabel={accessibleTitle} onLayout={onLayout}>
      {title ? titleMode === 'typed' ? (
        <View style={styles.titleSlot}>{titleClamped ? <Pressable focusInset accessibilityLabel={title} accessibilityRole="button"
          accessibilityHint={t(titleExpanded ? 'common.collapse' : 'common.expand')}
          accessibilityState={{ expanded: titleExpanded }}
          onPress={onToggleTitle}
          onFocus={() => onTitleFocusChange(true)} onBlur={() => onTitleFocusChange(false)}
          style={({ pressed }) => [styles.titleButton, pressed || titleFocused ? styles.titlePressed : null]}>
          <PersonalText onClampedChange={onClampedChange} style={styles.typedTitle}>{title}</PersonalText>
        </Pressable> : <View style={styles.titleText}>
          <PersonalText accessibilityRole="header" onClampedChange={onClampedChange} style={styles.typedTitle}>{title}</PersonalText>
        </View>}</View>
      ) : <Text accessibilityRole="header" accessibilityLabel={accessibleTitle} style={styles.title}>{title}</Text> : (
        <View accessible={Boolean(accessibleTitle)} accessibilityLabel={accessibleTitle} style={styles.titleSpacer} />
      )}
      {headerAccessory}
      {closeButton}
    </View>
  ) : undefined
}

function renderSheetFooter(
  actions: ReactNode,
  showSheetToast: boolean,
  sheetId: string,
  styles: ReturnType<typeof createStyles>,
  setFooterHeight: (height: number) => void,
) {
  if (!actions && !showSheetToast) return undefined
  return (
    <View style={styles.footer} onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}>
      {showSheetToast ? <View style={styles.notice}><AppToast placement="sheet" sheetId={sheetId} /></View> : null}
      {actions ? <View style={styles.actions}><ActionRow>{actions}</ActionRow></View> : null}
    </View>
  )
}

function virtualizedBodyStyle(maxHeight: number, hasFooter: boolean) {
  return [{ maxHeight }, hasFooter ? { paddingBottom: SPACING.s0 } : null]
}

function createStyles(tokens: Tokens, leftInset: number, rightInset: number) {
  return StyleSheet.create({
    header: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 16,
      minHeight: 56,
      paddingHorizontal: PADDING.sheetInline,
      paddingLeft: PADDING.sheetInline + leftInset,
      paddingRight: PADDING.sheetInline + rightInset,
      paddingTop: PADDING.sheetHeaderTop,
      paddingBottom: PADDING.sheetHeaderBottom,
    },
    title: {
      color: tokens.fg1,
      flex: 1,
      minHeight: 48,
      textAlignVertical: 'center',
      fontFamily: 'Geist_500Medium',
      fontSize: 22,
    },
    titleSlot: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    titleText: {
      maxWidth: '100%',
      paddingHorizontal: SPACING.s8,
      paddingVertical: SPACING.s8,
    },
    titleButton: {
      maxWidth: '100%',
      minWidth: 0,
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: SPACING.s8,
      paddingVertical: SPACING.s8,
      borderRadius: 12,
      overflow: 'hidden',
    },
    titlePressed: {
      backgroundColor: tokens.bgHover,
      borderRadius: 12,
      overflow: 'hidden',
    },
    typedTitle: {
      color: tokens.fg1,
      fontFamily: 'Geist_500Medium',
      fontSize: 22,
    },
    fullTitle: {
      color: tokens.fg1,
      fontFamily: 'Geist_400Regular',
      fontSize: 17,
      lineHeight: 26.35,
      paddingBottom: SPACING.s16,
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
      paddingHorizontal: PADDING.sheetInline,
      paddingTop: PADDING.sheetTop,
      paddingBottom: PADDING.sheetBottom,
    },
    actions: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-end',
      paddingHorizontal: PADDING.sheetInline,
      paddingLeft: PADDING.sheetInline + leftInset,
      paddingRight: PADDING.sheetInline + rightInset,
      paddingTop: PADDING.sheetFooterTop,
      paddingBottom: PADDING.sheetBottom,
    },
    footer: { backgroundColor: tokens.bgSheet },
    notice: { paddingHorizontal: PADDING.sheetInline, paddingLeft: PADDING.sheetInline + leftInset, paddingRight: PADDING.sheetInline + rightInset, paddingVertical: SPACING.s16 },
  })
}

function useSheetTitleDisclosure(title: string | undefined) {
  const [disclosure, setDisclosure] = useState({ title, clamped: false, expanded: false, focused: false })
  if (disclosure.title !== title) setDisclosure({ title, clamped: false, expanded: false, focused: false })
  const titleClamped = disclosure.title === title && disclosure.clamped
  const titleExpanded = titleClamped && disclosure.expanded
  const onClampedChange = useCallback((clamped: boolean) => {
    setDisclosure((current) => current.clamped === clamped ? current : { ...current, clamped, expanded: clamped && current.expanded, focused: clamped && current.focused })
  }, [])
  const onTitleFocusChange = useCallback((focused: boolean) => setDisclosure((current) => ({ ...current, focused })), [])
  const bodyRef = useRef<ScrollView>(null)
  const currentScroll = useRef(0)
  const previousScroll = useRef<number | null>(null)
  useEffect(() => {
    if (previousScroll.current !== null) {
      bodyRef.current?.scrollTo({ y: titleExpanded ? 0 : previousScroll.current, animated: false })
    }
  }, [titleExpanded])
  function toggleTitle() {
    if (!titleExpanded) previousScroll.current = currentScroll.current
    setDisclosure((current) => ({ ...current, expanded: !current.expanded }))
  }
  function handleBodyScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    currentScroll.current = event.nativeEvent.contentOffset.y
  }
  return { titleClamped, titleExpanded, titleFocused: titleClamped && disclosure.focused, onTitleFocusChange, onClampedChange, bodyRef, handleBodyScroll, toggleTitle }
}
