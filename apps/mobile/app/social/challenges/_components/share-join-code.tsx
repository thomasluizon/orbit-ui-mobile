import { useMemo, useState } from 'react'
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy, Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { motionEasings } from '@orbit/shared/theme'
import { PillButton } from '@/components/ui/pill-button'
import { createAnimatedTimingConfig } from '@/lib/motion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ShareJoinCodeProps {
  title: string
  joinCode: string
}

/** Join-code well with copy plus native text share (Share.share + clipboard, no image capture). */
export function ShareJoinCode({ title, joinCode }: Readonly<ShareJoinCodeProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [copied, setCopied] = useState(false)
  const copiedProgress = useMemo(() => new Animated.Value(0), [])
  const shareText = t('challenges.share.text', { title, code: joinCode })

  const copyIconStyle = {
    opacity: copiedProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { scale: copiedProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) },
    ],
  }
  const checkIconStyle = {
    opacity: copiedProgress,
    transform: [
      { scale: copiedProgress.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) },
    ],
  }

  function copyCode() {
    Clipboard.setString(joinCode)
    setCopied(true)
    Animated.timing(copiedProgress, createAnimatedTimingConfig(160, motionEasings.standard)).start()
    setTimeout(() => {
      setCopied(false)
      Animated.timing(copiedProgress, {
        ...createAnimatedTimingConfig(160, motionEasings.standard),
        toValue: 0,
      }).start()
    }, 2000)
  }

  async function shareCode() {
    try {
      await Share.share({ title: t('challenges.share.title'), message: shareText })
    } catch {
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.codeWell, { backgroundColor: tokens.bgField, borderColor: tokens.hairline }]}>
        <Text style={[styles.code, { color: tokens.fg1 }]} numberOfLines={1}>
          {joinCode}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? t('challenges.detail.copied') : t('challenges.detail.copy')}
          hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
          onPress={copyCode}
          style={({ pressed }) => [
            styles.copyButton,
            { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
            pressed ? styles.copyButtonPressed : null,
          ]}
        >
          <Animated.View style={[styles.copyIcon, copyIconStyle]}>
            <Copy size={18} color={tokens.fg2} strokeWidth={1.8} />
          </Animated.View>
          <Animated.View style={[styles.copyIcon, checkIconStyle]}>
            <Check size={18} color={tokens.statusDone} strokeWidth={1.8} />
          </Animated.View>
        </Pressable>
      </View>

      <PillButton
        fullWidth
        onPress={() => void shareCode()}
        leading={<Share2 size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
      >
        {t('challenges.detail.share')}
      </PillButton>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  codeWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 4,
  },
  code: {
    flex: 1,
    fontFamily: 'Roboto_400Regular',
    fontSize: 16,
    letterSpacing: 1.5,
    fontVariant: ['tabular-nums'],
  },
  copyButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonPressed: { transform: [{ scale: 0.96 }] },
  copyIcon: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
