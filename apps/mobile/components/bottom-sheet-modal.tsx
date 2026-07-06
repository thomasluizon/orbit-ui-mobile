import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { X } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>
type DismissReason = 'backdrop' | 'close-button' | 'navigation' | 'system-back'

interface BottomSheetModalProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Change this value to remount the content when `open` stays true (e.g. switching content). */
  contentKey?: string
  snapPoints?: (string | number)[]
  canDismiss?: boolean
  isDirty?: boolean
  onAttemptDismiss?: (reason: DismissReason) => void
  /** Set when the children render their own ScrollView/FlatList; the wrapper then skips its default scroll container so the two never nest. */
  contentManagesScroll?: boolean
  children: ReactNode
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ['50%', '80%']
const SCREEN_HEIGHT = Dimensions.get('window').height
const CORNER_RADIUS = 26
const MIN_DETENT = 0.1

/**
 * Shared bottom-sheet wrapper backed by a native sheet (react-native-true-sheet).
 * Drag-to-resize between snap points, scroll coordination, the dimmed backdrop,
 * the keyboard, and the Android back button are all handled natively — the JS
 * approaches (gorhom's portal mount and a hand-rolled PanResponder) both no-op or
 * mis-coordinate on the New Architecture. The public props are unchanged so every
 * caller keeps working: `snapPoints` map to detents, and the dirty guard blocks
 * interactive dismissal (drag/backdrop) and routes the close button + back press
 * to `onAttemptDismiss` so the caller can confirm before discarding. Children scroll by
 * default so content taller than the presented detent stays reachable; callers that render
 * their own scroll container opt out via `contentManagesScroll`.
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
  contentManagesScroll = false,
  children,
}: BottomSheetModalProps) {
  const { currentScheme, currentTheme } = useAppTheme()
  const { t } = useTranslation()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const sheetRef = useRef<TrueSheet>(null)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])
  const presentedRef = useRef(false)

  const detents = useMemo(
    () => (snapPointsProp ?? DEFAULT_SNAP_POINTS).map(toDetent),
    [snapPointsProp],
  )

  const dismissible = canDismiss && !isDirty

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    async function syncSheet(target: TrueSheet) {
      try {
        if (open) {
          presentedRef.current = true
          await target.present()
        } else if (presentedRef.current) {
          await target.dismiss()
        }
      } catch {
        presentedRef.current = false
      }
    }

    void syncSheet(sheet)
  }, [open])

  function requestDismiss(reason: DismissReason) {
    if (dismissible) {
      onClose()
    } else {
      onAttemptDismiss?.(reason)
    }
  }

  function handleDidDismiss() {
    presentedRef.current = false
    if (openRef.current) onClose()
  }

  return (
    <TrueSheet
      ref={sheetRef}
      detents={detents}
      dismissible={dismissible}
      cornerRadius={CORNER_RADIUS}
      backgroundColor={tokens.bgSheet}
      grabber
      grabberOptions={{
        width: 44,
        height: 5,
        topMargin: 12,
        color: tokens.hairlineStrong,
        adaptive: false,
      }}
      dimmed
      scrollable
      onDidDismiss={handleDidDismiss}
      onBackPress={() => requestDismiss('system-back')}
    >
      <View style={styles.content} key={contentKey}>
        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed
                  ? [styles.closeButtonPressed, { backgroundColor: tokens.bgElev }]
                  : null,
              ]}
              onPress={() => requestDismiss('close-button')}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={24} color={tokens.fg2} strokeWidth={1.8} />
            </Pressable>
          </View>
        ) : null}
        {contentManagesScroll ? (
          children
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        )}
      </View>
    </TrueSheet>
  )
}

function toDetent(point: string | number): number {
  if (typeof point === 'number') {
    return clampDetent(point > 1 ? point / SCREEN_HEIGHT : point)
  }
  const value = Number.parseFloat(point)
  if (!Number.isFinite(value)) return 0.5
  return clampDetent(point.includes('%') ? value / 100 : value)
}

function clampDetent(value: number): number {
  return Math.min(1, Math.max(MIN_DETENT, value))
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    content: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 22,
      paddingTop: 33,
      paddingBottom: 8,
    },
    title: {
      flex: 1,
      fontFamily: 'Rubik_500Medium',
      fontSize: 24,
      color: tokens.fg1,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      transform: [{ scale: 0.96 }],
    },
  })
}
