import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import {
  BottomSheetBackdrop,
  BottomSheetModal as GorhomBottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet'
import { BlurView } from 'expo-blur'
import { X } from 'lucide-react-native'
import type { ThemeContextValue } from '@/lib/theme-provider'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BottomSheetModalProps {
  open: boolean
  onClose: () => void
  title?: string
  snapPoints?: (string | number)[]
  children: ReactNode
}

// ---------------------------------------------------------------------------
// BottomSheetModal -- wrapper around @gorhom/bottom-sheet
// ---------------------------------------------------------------------------

export function BottomSheetModal({
  open,
  onClose,
  title,
  snapPoints: snapPointsProp,
  children,
}: BottomSheetModalProps) {
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const bottomSheetRef = useRef<GorhomBottomSheetModal>(null)
  const isOpenRef = useRef(open)

  const snapPointsKey = (snapPointsProp ?? ['50%', '80%']).join('|')
  const snapPoints = useMemo(
    () => snapPointsProp ?? ['50%', '80%'],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapPointsKey],
  )

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        pressBehavior="close"
      />
    ),
    [],
  )

  const renderBackground = useCallback(
    ({ style }: BottomSheetBackgroundProps) => (
      <View style={[style, sheetBgStyles.container]}>
        <BlurView
          intensity={32}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={[StyleSheet.absoluteFill, sheetBgStyles.blur]}
        />
        <View style={[StyleSheet.absoluteFill, sheetBgStyles.tint]} />
        <View style={sheetBgStyles.topHighlight} />
      </View>
    ),
    [],
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
  }, [open])

  const handleDismiss = useCallback(() => {
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
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      backgroundComponent={renderBackground}
      enablePanDownToClose
      handleIndicatorStyle={styles.handleIndicator}
    >
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => bottomSheetRef.current?.dismiss()}
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
  })
}

// Static styles for the blur background component (no theme dependency)
const sheetBgStyles = StyleSheet.create({
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  blur: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  tint: {
    backgroundColor: 'rgba(19,17,31,0.7)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
})
