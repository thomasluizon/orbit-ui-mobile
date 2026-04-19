import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { radius } from '@/lib/theme'
import { useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

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
  const { colors, shadows } = useAppTheme()
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useRef(new Animated.Value(0)).current
  const [visible, setVisible] = useState(open)

  const config = useMemo(() => {
    switch (variant) {
      case 'warning':
        return {
          icon: AlertCircle,
          iconColor: colors.amber400,
          iconBg: 'rgba(251, 191, 36, 0.10)',
          btnColor: colors.amber500,
        }
      case 'success':
        return {
          icon: CheckCircle2,
          iconColor: colors.green400,
          iconBg: colors.emerald400_10,
          btnColor: colors.green500,
        }
      default:
        return {
          icon: AlertTriangle,
          iconColor: colors.red400,
          iconBg: colors.red400_10,
          btnColor: colors.red500,
        }
    }
  }, [colors, variant])
  const Icon = config.icon
  const styles = useMemo(() => createStyles(colors, shadows), [colors, shadows])

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
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
              <Icon size={20} color={config.iconColor} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

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
              style={[styles.confirmButton, { backgroundColor: config.btnColor }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text
                style={styles.confirmLabel}
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

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.50)',
    },
    dialog: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surfaceOverlay,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderMuted,
      padding: 20,
      ...shadows.lg,
      elevation: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    description: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
      elevation: 3,
    },
    confirmLabel: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
  })
}
