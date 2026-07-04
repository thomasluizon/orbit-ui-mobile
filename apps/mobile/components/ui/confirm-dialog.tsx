import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
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
  /** 'danger' renders the confirm action as a status-bad fill pill (dlg-delete
   *  artboard). 'info' renders a single close action and hides the cancel button. */
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

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setVisible(true)
  }

  useEffect(() => {
    if (open) {
      Animated.timing(progress, {
        toValue: 1,
        duration: dialogMotion.enterDuration,
        easing: toAnimatedEasing(dialogMotion.enterEasing),
        useNativeDriver: true,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: dialogMotion.exitDuration,
      easing: toAnimatedEasing(dialogMotion.exitEasing),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setVisible(false)
      }
    })
  }, [
    dialogMotion.enterDuration,
    dialogMotion.enterEasing,
    dialogMotion.exitDuration,
    dialogMotion.exitEasing,
    open,
    progress,
  ])

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
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={styles.backdropPress}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={() => onOpenChange(false)}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.dialog,
            {
              opacity: progress,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.actions}>
            {!infoOnly ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionPill,
                  pressed ? styles.cancelPillPressed : styles.cancelPill,
                  pressed ? styles.pillPressedScale : null,
                ]}
                onPress={handleCancel}
              >
                <Text style={styles.cancelLabel} numberOfLines={1}>
                  {cancelLabel ?? t('common.cancel')}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionPill,
                destructive ? styles.confirmPillDestructive : null,
                !destructive && (pressed ? styles.confirmPillPressed : styles.confirmPill),
                pressed ? styles.pillPressedScale : null,
                destructive && pressed ? styles.destructivePressed : null,
              ]}
              onPress={handleConfirm}
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
            </Pressable>
          </View>
        </Animated.View>
      </View>
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
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdropPress: {
      flex: 1,
    },
    dialog: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: tokens.bgSheet,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingTop: 24,
      paddingHorizontal: 22,
      paddingBottom: 18,
      ...shadowsV2.shadow3,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      color: tokens.fg1,
      fontSize: 20,
      marginBottom: 8,
    },
    description: {
      fontFamily: 'Rubik_400Regular',
      color: tokens.fg2,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 22,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    actionPill: {
      flex: 1,
      minHeight: 44,
      borderRadius: 999,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelPill: {
      backgroundColor: tokens.bgField,
    },
    cancelPillPressed: {
      backgroundColor: tokens.bgSunk,
    },
    confirmPill: {
      backgroundColor: tokens.primary,
    },
    confirmPillPressed: {
      backgroundColor: tokens.primaryPressed,
    },
    confirmPillDestructive: {
      backgroundColor: tokens.statusBad,
    },
    destructivePressed: {
      opacity: 0.85,
    },
    pillPressedScale: {
      transform: [{ scale: 0.96 }],
    },
    cancelLabel: {
      fontFamily: 'Rubik_500Medium',
      color: tokens.fg1,
      fontSize: 15,
    },
    confirmLabel: {
      fontFamily: 'Rubik_500Medium',
      color: tokens.fgOnPrimary,
      fontSize: 15,
    },
    confirmLabelDestructive: {
      color: tokens.fgOnBad,
    },
  })
}
