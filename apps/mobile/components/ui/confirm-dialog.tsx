import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, easings } from '@/lib/theme'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

type Variant = 'danger' | 'warning' | 'success' | 'info'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  /** 'danger' is treated as destructive — italicized action label, no semantic fill.
   *  'info' renders a single close action and hides the cancel button. */
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

  const destructive = variant === 'danger'
  const infoOnly = variant === 'info'
  const styles = useMemo(() => createStyles(tokens), [tokens])

  useEffect(() => {
    if (open) {
       
      setVisible(true)
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: toAnimatedEasing(easings.out),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false)
      }
    })
  }, [dialogMotion.enterDuration, dialogMotion.exitDuration, open, progress])

  function handleConfirm() {
    onConfirm?.()
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
            {!infoOnly ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelLabel} numberOfLines={1}>
                  {cancelLabel ?? t('common.cancel')}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleConfirm}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.confirmLabel,
                  destructive ? styles.confirmLabelDestructive : null,
                ]}
                numberOfLines={1}
              >
                {confirmLabel ?? (infoOnly ? t('common.close') : t('common.confirm'))}
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
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 16,
    },
    actionButton: {
      padding: 6,
    },
    cancelLabel: {
      fontFamily: 'Geist',
      color: tokens.fg3,
      fontSize: 14,
      fontWeight: '500',
    },
    confirmLabel: {
      fontFamily: 'Geist',
      color: tokens.fg1,
      fontSize: 14,
      fontWeight: '600',
    },
    confirmLabelDestructive: {
      fontStyle: 'italic',
    },
  })
}
