import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import { Check, Copy, Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ShareJoinCodeProps {
  title: string
  joinCode: string
}

/** Join-code well with copy plus native text share (Share.share + clipboard — no image capture). */
export function ShareJoinCode({ title, joinCode }: Readonly<ShareJoinCodeProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [copied, setCopied] = useState(false)
  const shareText = t('challenges.share.text', { title, code: joinCode })

  function copyCode() {
    Clipboard.setString(joinCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          accessibilityLabel={t('challenges.detail.copy')}
          onPress={copyCode}
          style={({ pressed }) => [
            styles.copyChip,
            { borderColor: tokens.hairline, backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
          ]}
        >
          {copied ? (
            <Check size={14} color={tokens.statusDone} strokeWidth={1.8} />
          ) : (
            <Copy size={14} color={tokens.fg2} strokeWidth={1.8} />
          )}
          <Text style={[styles.copyChipText, { color: tokens.fg2 }]}>
            {copied ? t('challenges.detail.copied') : t('challenges.detail.copy')}
          </Text>
        </Pressable>
      </View>

      <PillButton
        fullWidth
        onPress={shareCode}
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
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 16,
    minHeight: 40,
  },
  copyChipText: { fontFamily: 'Rubik_500Medium', fontSize: 13 },
})
