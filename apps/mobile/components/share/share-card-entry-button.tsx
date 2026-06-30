import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { Share2 } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProfileActionButton } from '@/app/(tabs)/profile/_components/profile-action-button'
import { ShareCardSheet } from './share-card-sheet'

interface ShareCardEntryButtonProps {
  variant?: 'row' | 'chip'
  displayName?: string
}

/** Opens the recap share sheet. `row` renders a profile action row; `chip` renders a kit chip for the retrospective header. */
export function ShareCardEntryButton({
  variant = 'row',
  displayName,
}: Readonly<ShareCardEntryButtonProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'row' ? (
        <ProfileActionButton icon={Share2} onPress={() => setOpen(true)} label={t('shareCard.entry')} />
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('shareCard.entry')}
          style={({ pressed }) => [
            styles.chip,
            { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev, borderColor: tokens.hairline },
            pressed ? styles.chipPressed : null,
          ]}
        >
          <Share2 size={14} strokeWidth={1.8} color={tokens.fg2} />
          <Text style={styles.chipText}>{t('shareCard.entry')}</Text>
        </Pressable>
      )}
      <ShareCardSheet open={open} onClose={() => setOpen(false)} displayName={displayName} />
    </>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    chipPressed: {
      transform: [{ scale: 0.96 }],
    },
    chipText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg2,
    },
  })
}
