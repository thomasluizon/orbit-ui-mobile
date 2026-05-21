import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { createTokensV2, shadowsV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useResolvedMotionPreset } from '@/lib/motion'

interface ConfirmDialogV2Props {
  open: boolean
  onClose: () => void
  /** Optional eyebrow label (sentence case, e.g. "Move habit"). */
  eyebrow?: string
  title: string
  /** Optional supporting paragraph. */
  body?: string
  cancelLabel?: string
  /** When omitted, the destructive button is hidden (info variant). */
  actionLabel?: string
  /** Render the action label in italic per v8 destructive variant. */
  destructive?: boolean
  /** Optional in-dialog content slot (between body and actions). */
  children?: ReactNode
  onCancel?: () => void
  onAction?: () => void
}

/**
 * v8 ConfirmDialog (3 variants): standard (info), destructive italic, and info-only.
 * Uses React Native's Modal — matches the existing `confirm-dialog.tsx` pattern.
 */
export function ConfirmDialogV2({
  open,
  onClose,
  eyebrow,
  title,
  body,
  cancelLabel = 'Cancel',
  actionLabel,
  destructive = false,
  children,
  onCancel,
  onAction,
}: Readonly<ConfirmDialogV2Props>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const dialogMotion = useResolvedMotionPreset('dialog')
  const progress = useMemo(() => new Animated.Value(0), [])
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep dialog mounted while exit animation runs
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
      if (finished) setVisible(false)
    })
  }, [dialogMotion.enterDuration, dialogMotion.exitDuration, open, progress])

  const styles = useMemo(() => createStyles(tokens), [tokens])

  if (!visible) return null

  const handleCancel = () => {
    onCancel?.()
    onClose()
  }

  const handleAction = () => {
    onAction?.()
    onClose()
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
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.root} onPress={onClose}>
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
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          {children}
          <View style={styles.actions}>
            <Pressable onPress={handleCancel} style={styles.cancelBtn}>
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            {actionLabel ? (
              <Pressable onPress={handleAction} style={styles.actionBtn}>
                <Text
                  style={[
                    styles.actionLabel,
                    destructive ? styles.actionLabelDestructive : null,
                  ]}
                >
                  {actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
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
      maxWidth: 320,
      backgroundColor: tokens.bgElev,
      borderRadius: 12,
      paddingTop: 18,
      paddingBottom: 12,
      paddingHorizontal: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.hairline,
      gap: 8,
      ...shadowsV2.shadow3,
    },
    eyebrow: {
      fontFamily: 'Geist',
      fontSize: 12,
      fontWeight: '600',
      color: tokens.fg3,
    },
    title: {
      fontFamily: 'Geist',
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
      color: tokens.fg1,
    },
    body: {
      fontFamily: 'Geist',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 16,
      marginTop: 4,
    },
    cancelBtn: {
      padding: 6,
    },
    cancelLabel: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '500',
      color: tokens.fg3,
    },
    actionBtn: {
      padding: 6,
    },
    actionLabel: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
      color: tokens.fg1,
    },
    actionLabelDestructive: {
      fontStyle: 'italic',
    },
  })
}
