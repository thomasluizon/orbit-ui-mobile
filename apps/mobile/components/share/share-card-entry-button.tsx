import { IconButton } from '@/components/ui/icon-button'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslation } from 'react-i18next'
import { ListRow } from '@/components/ui/list-row'

import { Share2 } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShareCardSheet } from './share-card-sheet'

export function ShareCardEntryButton({ variant = 'row' }: Readonly<{ variant?: 'row' | 'button' }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [open, setOpen] = useAccountScopedState(false)
  return <>
    {variant === 'row'
      ? <ListRow compact textMode="label" chevron={false} icon={<Share2 size={24} strokeWidth={1.8} color={tokens.fg2} />} title={t('shareCard.entry')} onClick={() => setOpen(true)} />
      : <IconButton label={t('shareCard.entry')} onClick={() => setOpen(true)}><Share2 size={20} strokeWidth={1.5} accessible={false} /></IconButton>}
    {open ? <ShareCardSheet onClose={() => setOpen(false)} /> : null}
  </>
}
