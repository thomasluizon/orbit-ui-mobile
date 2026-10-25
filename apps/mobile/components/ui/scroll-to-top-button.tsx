import { IconButton } from '@/components/ui/icon-button'
import { ArrowUp } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'

interface ScrollToTopButtonProps {
  onPress: () => void
}

export function ScrollToTopButton({ onPress }: Readonly<ScrollToTopButtonProps>) {
  const { t } = useTranslation()

  return (
    <IconButton label={t('common.backToTop')} elevated onClick={onPress}><ArrowUp size={20} strokeWidth={1.5} accessible={false} /></IconButton>
  )
}
