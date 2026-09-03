import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import type { SheetProps } from '@orbit/shared/contracts/overlay'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { X } from '@/components/ui/icons'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const MAX_HEIGHT_RATIO = 0.85
const SCROLL_EDGE_PEEK = 24
// WHY: TrueSheet 3.11.3 exposes only `dimmed` and hardcodes Android dim opacity to 0.50. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/android/src/main/java/com/lodev09/truesheet/core/TrueSheetDimView.kt#L38
const TRUE_SHEET_DIMMED = true

export interface SheetHandle {
  /**
   * Dismisses the native sheet and runs `exitAction` once the dismissal
   * completes. Without an `exitAction` the sheet's own `onClose` runs instead.
   */
  requestClose: (exitAction?: () => void) => void
}

/**
 * The one close path a sheet host may use. Never flip the open state directly:
 * unmounting a presented TrueSheet wedges every later Android modal until the
 * process restarts, and it drops the navigation that has to run after the
 * dismissal (https://sheet.lodev09.com/guides/navigation). Pass `sheetRef` to
 * the sheet, then call `closeSheet()`, or `closeSheet(action)` when something
 * has to run after the sheet is gone.
 */
export function useSheetHost() {
  const sheetRef = useRef<SheetHandle>(null)

  const closeSheet = useCallback((exitAction?: () => void) => {
    const handle = sheetRef.current
    if (handle) handle.requestClose(exitAction)
    else exitAction?.()
  }, [])

  return { sheetRef, closeSheet }
}

interface MobileSheetProps extends SheetProps {
  /** The handle `useSheetHost` fills in, so the host can close through the native dismissal. */
  ref?: Ref<SheetHandle>
  /** Handles a blocked native dismissal attempt without letting navigation receive Android Back. */
  onAttemptDismiss?: () => void
}

/** The native overlay surface. Callers mount it only while it is open. */
export function Sheet({
  title,
  headerAccessory,
  actions,
  onClose,
  onAttemptDismiss,
  children,
  ref,
}: Readonly<MobileSheetProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const { height } = useWindowDimensions()
  const { t } = useTranslation()
  const sheetRef = useRef<TrueSheet>(null)
  const exitActionRef = useRef<(() => void) | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const handleDidDismiss = useCallback(() => {
    const exitAction = exitActionRef.current
    exitActionRef.current = null
    if (exitAction) {
      exitAction()
      return
    }
    onCloseRef.current?.()
  }, [])

  useEffect(() => {
    void sheetRef.current?.present().catch(() => {
      // WHY: A rejected presentation leaves no native sheet to keep mounted. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/src/TrueSheet.tsx#L374-L394
      handleDidDismiss()
    })
  }, [handleDidDismiss])

  const requestClose = useCallback((exitAction?: () => void) => {
    exitActionRef.current = exitAction ?? null
    void sheetRef.current?.dismiss().catch(() => {
      // WHY: A rejected dismissal leaves the native sheet visible. https://github.com/lodev09/react-native-true-sheet/blob/v3.11.3/src/TrueSheet.tsx#L404-L410
      exitActionRef.current = null
    })
  }, [])

  const handle = useMemo<SheetHandle>(() => ({ requestClose }), [requestClose])

  useImperativeHandle(ref, () => handle, [handle])

  const handleBlockedBackPress = useCallback(() => {
    onAttemptDismiss?.()
    return true
  }, [onAttemptDismiss])

  const header = title || headerAccessory || onClose ? (
    <View style={styles.header}>
      {title ? <Text style={styles.title}>{title}</Text> : <View style={styles.titleSpacer} />}
      {headerAccessory}
      {onClose ? (
        <Pressable
          accessibilityLabel={t('common.close')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => requestClose()}
          style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
        >
          <X color={tokens.fg2} size={24} strokeWidth={1.8} />
        </Pressable>
      ) : null}
    </View>
  ) : undefined

  const footer = actions ? <View style={styles.actions}>{actions}</View> : undefined

  return (
    <TrueSheet
      ref={sheetRef}
      backgroundColor={tokens.bgSheet}
      cornerRadius={28}
      detents={['auto', MAX_HEIGHT_RATIO]}
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
      onBackPress={onClose ? undefined : handleBlockedBackPress}
      onDidDismiss={handleDidDismiss}
      scrollable
    >
      <KeyboardAwareSheetScrollView
        testID="sheet-body-scroll"
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareSheetScrollView>
    </TrueSheet>
  )
}

type Tokens = ReturnType<typeof createTokensV2>

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 16,
      minHeight: 56,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    title: {
      color: tokens.fg1,
      flex: 1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 22,
    },
    titleSpacer: {
      flex: 1,
    },
    close: {
      alignItems: 'center',
      borderRadius: 22,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    pressed: {
      backgroundColor: tokens.bgElev,
      transform: [{ scale: 0.96 }],
    },
    body: {
      flexGrow: 1,
      padding: 16,
      paddingBottom: 24,
    },
    actions: {
      alignItems: 'center',
      borderTopColor: tokens.hairline,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-end',
      padding: 16,
    },
  })
}
