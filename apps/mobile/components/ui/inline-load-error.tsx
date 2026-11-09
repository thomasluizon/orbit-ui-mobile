import type { InlineLoadErrorProps } from '@orbit/shared/contracts/feedback'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A load failure stated in the caller's words, with a retry glyph on the message column. */
export function InlineLoadError({ message, onRetry }: Readonly<InlineLoadErrorProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container} testID="inline-load-error">
      <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{message}</Text>
      <IconButton edge="start" label={t('common.retry')} onClick={onRetry}>
        <RefreshCw size={20} strokeWidth={1.5} accessible={false} />
      </IconButton>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start' },
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
