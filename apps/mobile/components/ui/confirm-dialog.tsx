import { useMemo } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { radius } from '@/lib/theme'
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

  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  function handleCancel() {
    onCancel?.()
    onOpenChange(false)
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={() => onOpenChange(false)}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => onOpenChange(false)}
      >
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
              <Icon size={20} color={config.iconColor} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>{description}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelLabel}>
                {cancelLabel ?? t('common.cancel')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: config.btnColor }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmLabel}>
                {confirmLabel ?? t('common.confirm')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  )
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
  shadows: ReturnType<typeof useAppTheme>['shadows'],
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.50)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
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
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
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
    },
  })
}
