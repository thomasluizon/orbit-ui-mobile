import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

type Variant = 'danger' | 'warning' | 'success'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  variant?: Variant
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'danger',
}: Readonly<ConfirmDialogProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useMemo(() => new Animated.Value(0), [])
  const [visible, setVisible] = useState(open)

  const accentColor = useMemo(() => {
    switch (variant) {
      case 'warning':
        return tokens.statusOverdue
      case 'success':
        return tokens.statusDone
      default:
        return tokens.statusBad
    }
  }, [tokens, variant])
  const styles = useMemo(() => createStyles(tokens), [tokens])

  useEffect(() => {
    if (open) {
       
      setVisible(true)
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false)
      }
    })
  }, [dialogMotion.enterDuration, dialogMotion.exitDuration, open, progress])

  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  function handleCancel() {
    onCancel?.()
    onOpenChange(false)
  }

  if (!visible) {
    return null
  }

  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  })
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.shift, 0],
  })
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [dialogMotion.scaleFrom, dialogMotion.scaleTo],
  })

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange(false)}
    >
      <TouchableOpacity
        style={styles.root}
        activeOpacity={1}
        onPress={() => onOpenChange(false)}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
        <Animated.View
          style={[
            styles.dialog,
            {
              opacity: progress,
              transform: [{ translateY }, { scale }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text
                style={styles.cancelLabel}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {cancelLabel ?? t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: accentColor }]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.confirmLabel, { color: tokens.fgOnPrimary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {confirmLabel ?? t('common.confirm')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  )
}

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.58)',
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: tokens.bgElev,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
      padding: 20,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 40,
      elevation: 10,
    },
    title: {
      fontFamily: 'Geist',
      color: tokens.fg1,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
      marginBottom: 6,
    },
    description: {
      fontFamily: 'Geist',
      color: tokens.fg2,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelLabel: {
      fontFamily: 'Geist',
      color: tokens.fg2,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmLabel: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  })
}
