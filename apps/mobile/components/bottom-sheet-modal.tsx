import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import {
  BottomSheetBackdrop,
  BottomSheetModal as GorhomBottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { X } from 'lucide-react-native'
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

  const snapPoints = useMemo(
    () => snapPointsProp ?? ['50%', '80%'],
    [snapPointsProp],
  )

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
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
      enablePanDownToClose
      backgroundStyle={styles.background}
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

type ThemeColors = ReturnType<typeof useAppTheme>['colors']

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    background: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
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
