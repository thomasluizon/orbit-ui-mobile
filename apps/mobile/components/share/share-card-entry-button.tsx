import { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { Share2 } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ListRow } from '@/components/ui/list-row'
import { ShareCardPanel } from './share-card-panel'

interface ShareCardEntryButtonProps {
  variant?: 'row' | 'chip'
  displayName?: string
}

/** Opens the recap share sheet. `row` renders a profile action row; `chip` renders an icon-only kit chip for the retrospective header. */
export function ShareCardEntryButton({
  variant = 'row',
  displayName,
}: Readonly<ShareCardEntryButtonProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'row' ? (
        <ListRow
          icon={<Share2 size={24} strokeWidth={1.8} color={tokens.fg1} />}
          title={t('shareCard.entry')}
          chevron={false}
          onClick={() => setOpen(true)}
        />
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('shareCard.entry')}
          hitSlop={{ top: 6, bottom: 6 }}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
              borderColor: tokens.hairline,
            },
            pressed ? styles.chipPressed : null,
          ]}
        >
          <Share2 size={16} strokeWidth={1.8} color={tokens.fg2} />
        </Pressable>
      )}
      <ShareCardPanel open={open} onClose={() => setOpen(false)} displayName={displayName} />
    </>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipPressed: {
    transform: [{ scale: 0.96 }],
  },
})
