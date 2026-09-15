import { useState } from 'react'
import { Share2 } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ListRow } from '@/components/ui/list-row'
import { ShareCardPanel } from './share-card-panel'

/** Opens the recap share sheet from the profile action row. */
export function ShareCardEntryButton() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [open, setOpen] = useState(false)

  return (
    <>
      <ListRow
        icon={<Share2 size={24} strokeWidth={1.8} color={tokens.fg1} />}
        title={t('shareCard.entry')}
        chevron={false}
        onClick={() => setOpen(true)}
      />
      <ShareCardPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
