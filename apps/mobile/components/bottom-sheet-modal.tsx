import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { TrueSheet } from '@lodev09/react-native-true-sheet'
import { X } from 'lucide-react-native'
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
  children: ReactNode
}

const DEFAULT_SNAP_POINTS: (string | number)[] = ['50%', '80%']
const SCREEN_HEIGHT = Dimensions.get('window').height
const CORNER_RADIUS = 24
const MIN_DETENT = 0.1

/**
 * Shared bottom-sheet wrapper backed by a native sheet (react-native-true-sheet).
 * Drag-to-resize between snap points, scroll coordination, the dimmed backdrop,
 * the keyboard, and the Android back button are all handled natively — the JS
 * approaches (gorhom's portal mount and a hand-rolled PanResponder) both no-op or
 * mis-coordinate on the New Architecture. The public props are unchanged so every
 * caller keeps working: `snapPoints` map to detents, and the dirty guard blocks
 * interactive dismissal (drag/backdrop) and routes the close button + back press
 * to `onAttemptDismiss` so the caller can confirm before discarding.
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
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const sheetRef = useRef<TrueSheet>(null)
  const openRef = useRef(open)
  openRef.current = open

  const detents = useMemo(
    () => (snapPointsProp ?? DEFAULT_SNAP_POINTS).map(toDetent),
    [snapPointsProp],
  )

  const dismissible = canDismiss && !isDirty

  useEffect(() => {
    if (open) {
      void sheetRef.current?.present()
    } else {
      void sheetRef.current?.dismiss()
    }
  }, [open])

  function requestDismiss(reason: DismissReason) {
    if (dismissible) {
      onClose()
    } else {
      onAttemptDismiss?.(reason)
    }
  }

  function handleDidDismiss() {
    if (openRef.current) onClose()
  }

  return (
    <TrueSheet
      ref={sheetRef}
      detents={detents}
      dismissible={dismissible}
      cornerRadius={CORNER_RADIUS}
      backgroundColor={surfaces.overlay.backgroundColor}
      grabber
      dimmed
      scrollable
      onDidDismiss={handleDidDismiss}
      onBackPress={() => requestDismiss('system-back')}
    >
      <View style={styles.content} key={contentKey}>
        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => requestDismiss('close-button')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={title}
            >
              <X size={18} color={tokens.fg3} />
            </TouchableOpacity>
          </View>
        ) : null}
        {children}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 16,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: tokens.fg1,
    },
    closeButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  })
}
