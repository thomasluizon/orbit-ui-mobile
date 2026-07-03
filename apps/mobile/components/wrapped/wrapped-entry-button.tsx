import { Gift } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/chip'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Chip that launches the free Orbit Wrapped story from the retrospective surface. */
export function WrappedEntryButton() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Chip
      onPress={() => router.push('/wrapped')}
      accessibilityLabel={t('wrapped.entry')}
      leading={<Gift size={14} strokeWidth={1.8} color={tokens.fg2} />}
    >
      {t('wrapped.entry')}
    </Chip>
  )
}
