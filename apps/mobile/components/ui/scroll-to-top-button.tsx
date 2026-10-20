import { ArrowUp } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ScrollToTopButtonProps {
  onPress: () => void
}

export function ScrollToTopButton({ onPress }: Readonly<ScrollToTopButtonProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <PillButton variant="ghost" quiet elevated minimumHeight={48} accessibleName={t('common.backToTop')}
      leadingIcon={<ArrowUp size={20} color={tokens.fg2} strokeWidth={2} />} onClick={onPress}>
      {t('common.top')}
    </PillButton>
  )
}
